import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve relative to the repo root so the default lives beside jobs/archive.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const USERS_DIR_DEFAULT = "../chara2img/users";

function getUsersDir(): string {
  return resolve(PROJECT_ROOT, process.env.USERS_DIR?.trim() || USERS_DIR_DEFAULT);
}

function usersFilePath(): string {
  return join(getUsersDir(), "users.json");
}

type StoredUser = {
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
};

const SCRYPT_KEYLEN = 64; // 128 hex chars — long but simple.

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
}

function passwordMatches(password: string, user: StoredUser): boolean {
  const candidate = Buffer.from(hashPassword(password, user.salt), "hex");
  const expected = Buffer.from(user.hash, "hex");
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}

let writeChain: Promise<unknown> = Promise.resolve();

// Serialize reads/writes so concurrent logins never clobber users.json.
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readUsersFile(): Promise<StoredUser[]> {
  try {
    const raw = await readFile(usersFilePath(), "utf8");
    const parsed = JSON.parse(raw) as { users?: StoredUser[] };
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeUsersFile(users: StoredUser[]): Promise<void> {
  await mkdir(getUsersDir(), { recursive: true });
  await writeFile(usersFilePath(), JSON.stringify({ users }, null, 2), "utf8");
}

export type LoginResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: "wrong-password" };

// Log in if the name exists (password must match), otherwise create the user.
export async function loginOrCreateUser(username: string, password: string): Promise<LoginResult> {
  return withLock(async () => {
    const users = await readUsersFile();
    const existing = users.find((user) => user.username === username);

    if (existing) {
      // Soft reset: a record with both salt and hash absent adopts the next password.
      if (!existing.salt && !existing.hash) {
        const salt = randomBytes(16).toString("hex");
        const restored: StoredUser = {
          ...existing,
          salt,
          hash: hashPassword(password, salt),
          createdAt: existing.createdAt || new Date().toISOString()
        };
        await writeUsersFile(users.map((user) => (user.username === existing.username ? restored : user)));
        return { ok: true, created: false };
      }

      return passwordMatches(password, existing)
        ? { ok: true, created: false }
        : { ok: false, reason: "wrong-password" };
    }

    const salt = randomBytes(16).toString("hex");
    const user: StoredUser = {
      username,
      salt,
      hash: hashPassword(password, salt),
      createdAt: new Date().toISOString()
    };
    await writeUsersFile([...users, user]);
    return { ok: true, created: true };
  });
}

export async function userExists(username: string): Promise<boolean> {
  const users = await readUsersFile();
  return users.some((user) => user.username === username);
}

export async function listUsernames(): Promise<string[]> {
  const users = await readUsersFile();
  return users.map((user) => user.username).sort((left, right) => left.localeCompare(right));
}
