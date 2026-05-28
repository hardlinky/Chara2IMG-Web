import { randomBytes } from "node:crypto";

let cachedAdminPasskey: string | null = null;

function generateAdminPasskey(): string {
  return randomBytes(18).toString("base64url");
}

export function getAdminPasskey(): string {
  if (cachedAdminPasskey) {
    return cachedAdminPasskey;
  }

  const fromEnv = process.env.ADMIN_ACCESS_KEY?.trim();
  if (fromEnv) {
    cachedAdminPasskey = fromEnv;
    return cachedAdminPasskey;
  }

  cachedAdminPasskey = generateAdminPasskey();
  return cachedAdminPasskey;
}

export function logAdminPasskey(): void {
  const key = getAdminPasskey();
  console.log(`[ADMIN] Access key: ${key}`);
}
