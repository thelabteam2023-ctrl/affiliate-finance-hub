import type { SecureBlob, SecurePayload } from "./schema";
import { securePayloadSchema } from "./schema";

const ITERATIONS = 210_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Cifra o payload de credenciais com uma passphrase escolhida pelo usuário.
 * O arquivo exportado sozinho não revela nenhuma senha.
 */
export async function sealSecurePayload(
  payload: SecurePayload,
  passphrase: string,
): Promise<SecureBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data);

  return {
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function openSecurePayload(
  blob: SecureBlob,
  passphrase: string,
): Promise<SecurePayload> {
  const salt = fromBase64(blob.salt);
  const iv = fromBase64(blob.iv);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: blob.iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      fromBase64(blob.ciphertext) as BufferSource,
    );
  } catch {
    throw new Error("Senha de proteção incorreta ou pacote de credenciais corrompido.");
  }

  const parsed = securePayloadSchema.safeParse(JSON.parse(new TextDecoder().decode(plaintext)));
  if (!parsed.success) {
    throw new Error("Pacote de credenciais com estrutura inválida.");
  }
  return parsed.data;
}
