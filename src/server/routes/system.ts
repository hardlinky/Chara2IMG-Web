import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";

const execFileAsync = promisify(execFile);

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

export function registerSystemRoutes(app: Hono): void {
  app.use("/api/system/*", requireInvitedSession);

  app.get("/api/system/config", (c) => {
    return c.json({ endpointId: getDefaultEndpointId() });
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
