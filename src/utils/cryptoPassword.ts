import { supabase } from "@/integrations/supabase/client";

export async function encryptPassword(password: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("crypto-password", {
    body: { action: "encrypt", value: password },
  });
  if (error) throw new Error("Erro ao criptografar senha");
  return data.result;
}

export async function decryptPassword(encrypted: string | null): Promise<string> {
  if (!encrypted) return "";
  const { data, error } = await supabase.functions.invoke("crypto-password", {
    body: { action: "decrypt", value: encrypted },
  });
  if (error) return encrypted;
  return data.result;
}
