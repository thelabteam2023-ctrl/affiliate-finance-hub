import { supabase } from "@/integrations/supabase/client";

// Semaphore to limit concurrent edge function calls
const MAX_CONCURRENT = 3;
let activeCount = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      activeCount++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeCount--;
  const next = queue.shift();
  if (next) next();
}

async function invokeWithRetry(
  body: { action: string; value: string },
  retries = 2
): Promise<{ result: string }> {
  await acquireSlot();
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const { data, error } = await supabase.functions.invoke("crypto-password", { body });
      if (!error && data?.result !== undefined) {
        return data;
      }
      // On 401 or transient error, wait before retry
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    throw new Error("Falha após retentativas");
  } finally {
    releaseSlot();
  }
}

export async function encryptPassword(password: string): Promise<string> {
  const data = await invokeWithRetry({ action: "encrypt", value: password });
  return data.result;
}

export async function decryptPassword(encrypted: string | null): Promise<string> {
  if (!encrypted) return "";
  try {
    const data = await invokeWithRetry({ action: "decrypt", value: encrypted });
    return data.result || "";
  } catch {
    return "";
  }
}
