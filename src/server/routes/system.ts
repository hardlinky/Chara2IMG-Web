import { execFile } from "node:child_process";
import { mkdir, readdir, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";

const execFileAsync = promisify(execFile);
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CURRENT_DIR, "../../..");
const PINNED_IMAGES_DIR = (() => {
  const configured = process.env.PINNED_IMAGES_STORAGE_DIR?.trim();
  if (configured) {
    return resolve(PROJECT_ROOT, configured);
  }

  return resolve(tmpdir(), "chara2img", "pinned-images");
})();
const DEFAULT_PINNED_IMAGES_CAPACITY_BYTES = 10 * 1024 * 1024 * 1024;

type CommandResult = {
  name: string;
  stdout: string;
  stderr: string;
};

function isSelfUpdateEnabled(): boolean {
  return (process.env.ALLOW_SELF_UPDATE ?? "true").toLowerCase() === "true";
}

function trimOutput(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 6000) {
    return normalized;
  }

  return `${normalized.slice(0, 6000)}\n...[truncated]`;
}

async function runCommand(name: string, command: string, args: string[]): Promise<CommandResult> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: process.cwd(),
    timeout: 1000 * 60 * 5,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8
  });

  return {
    name,
    stdout: trimOutput(stdout),
    stderr: trimOutput(stderr)
  };
}

function getDefaultEndpointId(): string | null {
  return process.env.RUNPOD_ENDPOINT_ID?.trim() || null;
}

function hasDefaultRunpodApiKey(): boolean {
  return Boolean(process.env.RUNPOD_API_KEY?.trim());
}

function sanitizeClientId(value: string | null | undefined): string {
  if (!value) {
    return "anonymous";
  }

  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "anonymous";
}

function getConfiguredPinnedImagesCapacityBytes(): number {
  const raw = process.env.PINNED_IMAGES_STORAGE_CAPACITY_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PINNED_IMAGES_CAPACITY_BYTES;
}

async function getPinnedImagesDiskCapacityBytes(): Promise<number | null> {
  try {
    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
    const fsStat = await statfs(PINNED_IMAGES_DIR);
    const blockSize = Number((fsStat as { bsize?: number }).bsize ?? 0);
    const blocks = Number((fsStat as { blocks?: number }).blocks ?? 0);

    if (!Number.isFinite(blockSize) || !Number.isFinite(blocks) || blockSize <= 0 || blocks <= 0) {
      return null;
    }

    return Math.floor(blockSize * blocks);
  } catch {
    return null;
  }
}

async function getEffectivePinnedImagesCapacityBytes(): Promise<number> {
  const configured = getConfiguredPinnedImagesCapacityBytes();
  const diskCapacity = await getPinnedImagesDiskCapacityBytes();

  if (diskCapacity === null) {
    return configured;
  }

  return Math.max(1, Math.min(configured, diskCapacity));
}

async function collectPinnedStorageUsageBytes(clientId: string): Promise<{ userUsedBytes: number; allUsersUsedBytes: number }> {
  try {
    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
  } catch {
    return {
      userUsedBytes: 0,
      allUsersUsedBytes: 0
    };
  }

  let fileNames: string[] = [];
  try {
    fileNames = await readdir(PINNED_IMAGES_DIR);
  } catch {
    return {
      userUsedBytes: 0,
      allUsersUsedBytes: 0
    };
  }

  let userUsedBytes = 0;
  let allUsersUsedBytes = 0;

  for (const fileName of fileNames) {
    const filePath = resolve(PINNED_IMAGES_DIR, fileName);
    if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
      continue;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        continue;
      }

      allUsersUsedBytes += fileStat.size;
      if (fileName.startsWith(`${clientId}-`)) {
        userUsedBytes += fileStat.size;
      }
    } catch {
      // Skip files that disappear mid-scan.
    }
  }

  return {
    userUsedBytes,
    allUsersUsedBytes
  };
}

export function registerSystemRoutes(app: Hono): void {
  app.use("/api/system/*", requireInvitedSession);

  app.get("/api/system/config", (c) => {
    return c.json({
      endpointId: getDefaultEndpointId(),
      hasRunpodApiKey: hasDefaultRunpodApiKey()
    });
  });

  app.get("/api/system/storage", async (c) => {
    const clientId = sanitizeClientId(c.req.query("clientId"));
    const usage = await collectPinnedStorageUsageBytes(clientId);
    const totalCapacityBytes = await getEffectivePinnedImagesCapacityBytes();

    return c.json({
      ok: true,
      userUsedBytes: usage.userUsedBytes,
      allUsersUsedBytes: usage.allUsersUsedBytes,
      totalCapacityBytes,
      source: "system"
    });
  });

  app.post("/api/system/update", async (c) => {
    if (!isSelfUpdateEnabled()) {
      return c.json(
        {
          ok: false,
          error: "Self-update is disabled. Set ALLOW_SELF_UPDATE=true to enable this endpoint."
        },
        403
      );
    }

    const results: CommandResult[] = [];

    try {
      const before = await runCommand("git-rev-before", "git", ["rev-parse", "--short", "HEAD"]);
      results.push(before);

      const pull = await runCommand("git-pull", "git", ["pull", "--ff-only"]);
      results.push(pull);

      const build = await runCommand("npm-build", "npm", ["run", "build"]);
      results.push(build);

      const after = await runCommand("git-rev-after", "git", ["rev-parse", "--short", "HEAD"]);
      results.push(after);

      return c.json({
        ok: true,
        before: before.stdout,
        after: after.stdout,
        steps: results
      });
    } catch (error) {
      return c.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          steps: results
        },
        500
      );
    }
  });
}
