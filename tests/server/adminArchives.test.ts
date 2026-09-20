import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Hono } from "hono";
import type { JobRecord } from "../../src/shared/contracts/jobs";
import { ANONYMOUS_ARCHIVE_OWNER, type UserArchiveSummary } from "../../src/shared/contracts/archives";

let tmpBase: string;
let archiveBase: string;
let usersDir: string;
let app: Hono;
let adminCookie: string;

function cookieFrom(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function authenticateAdmin(): Promise<string> {
  const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite: "invite-test" })
  });
  const invitedCookie = cookieFrom(inviteResponse);
  const adminResponse = await app.request("http://localhost/api/admin/verify-key", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: invitedCookie },
    body: JSON.stringify({ key: "admin-test" })
  });
  return `${invitedCookie}; ${cookieFrom(adminResponse)}`;
}

function makeJob(jobId: string, displayName: string, createdBy: string | null): JobRecord {
  return {
    jobId,
    displayName,
    endpointId: "endpoint-1",
    workflowFileName: null,
    submittedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:01:00.000Z",
    expiresAt: null,
    status: "COMPLETED",
    isTerminal: true,
    imageCount: 1,
    lastError: null,
    createdBy
  };
}

async function seedJob(base: string, job: JobRecord, imageBytes: number): Promise<void> {
  const dir = join(base, "jobs", job.jobId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "job.json"), JSON.stringify(job), "utf8");
  await writeFile(join(dir, "inputs.json"), JSON.stringify({ draftValues: {}, submittedInput: {} }), "utf8");
  await writeFile(join(dir, `${job.displayName}-0.png`), Buffer.alloc(imageBytes, 7));
}

beforeAll(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), "archives-tmp-"));
  archiveBase = await mkdtemp(join(tmpdir(), "archives-archive-"));
  usersDir = await mkdtemp(join(tmpdir(), "archives-users-"));
  process.env.JOBS_TMP_DIR = tmpBase;
  process.env.JOBS_ARCHIVE_DIR = archiveBase;
  process.env.USERS_DIR = usersDir;
  process.env.INVITE_SECRET = "invite-test";
  process.env.ADMIN_ACCESS_KEY = "admin-test";
  process.env.COOKIE_SECRET = "cookie-secret-test";

  await writeFile(
    join(usersDir, "users.json"),
    JSON.stringify({
      users: [
        { username: "alice", salt: "", hash: "", createdAt: "2026-09-01T00:00:00.000Z" },
        { username: "bob", salt: "", hash: "", createdAt: "2026-09-01T00:00:00.000Z" }
      ]
    }),
    "utf8"
  );

  await seedJob(tmpBase, makeJob("job-alice", "aaaa1111", "alice"), 1024);
  await seedJob(archiveBase, makeJob("job-anon", "bbbb2222", null), 512);

  // Imported after the storage env vars are set: jobStore resolves its dirs at module load.
  const { createServerApp } = await import("../../src/server/index");
  app = createServerApp();
  adminCookie = await authenticateAdmin();
}, 30_000);

afterAll(async () => {
  delete process.env.JOBS_TMP_DIR;
  delete process.env.JOBS_ARCHIVE_DIR;
  delete process.env.USERS_DIR;
  delete process.env.INVITE_SECRET;
  delete process.env.ADMIN_ACCESS_KEY;
  delete process.env.COOKIE_SECRET;
  await rm(tmpBase, { recursive: true, force: true });
  await rm(archiveBase, { recursive: true, force: true });
  await rm(usersDir, { recursive: true, force: true });
});

describe("admin archive downloads", () => {
  it("summarizes per-user usage including users with nothing stored", async () => {
    const response = await app.request("http://localhost/api/admin/archives", {
      headers: { Cookie: adminCookie }
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { ok: boolean; users: UserArchiveSummary[] };
    const byUser = new Map(body.users.map((user) => [user.username, user]));

    expect(byUser.get("alice")).toMatchObject({ jobCount: 1, imageCount: 1, imageBytes: 1024 });
    expect(byUser.get(ANONYMOUS_ARCHIVE_OWNER)).toMatchObject({ jobCount: 1, imageCount: 1, imageBytes: 512 });
    expect(byUser.get("bob")).toMatchObject({ jobCount: 0, totalBytes: 0 });
    expect(byUser.get("alice")!.metadataBytes).toBeGreaterThan(0);
  });

  it("streams a zip archive for a user", async () => {
    const response = await app.request("http://localhost/api/admin/archives/alice/download", {
      headers: { Cookie: adminCookie }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("chara2img-archive-alice-");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(1024);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
  });

  it("returns 404 for an unknown user and for a user with no stored jobs", async () => {
    const unknown = await app.request("http://localhost/api/admin/archives/mallory/download", {
      headers: { Cookie: adminCookie }
    });
    const empty = await app.request("http://localhost/api/admin/archives/bob/download", {
      headers: { Cookie: adminCookie }
    });

    expect(unknown.status).toBe(404);
    expect(empty.status).toBe(404);
  });

  it("rejects requests without an admin session", async () => {
    const summaries = await app.request("http://localhost/api/admin/archives");
    const download = await app.request("http://localhost/api/admin/archives/alice/download");
    const upload = await app.request("http://localhost/api/admin/archives/import", {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: Buffer.from("PK")
    });

    expect(summaries.status).toBe(401);
    expect(download.status).toBe(401);
    expect(upload.status).toBe(401);
  });

  it("imports an exported zip into the archive dir and ignores unsafe entries", async () => {
    const exported = await app.request("http://localhost/api/admin/archives/alice/download", {
      headers: { Cookie: adminCookie }
    });
    const zipBytes = Buffer.from(await exported.arrayBuffer());

    // Wipe every trace of the job so the import behaves like a fresh server.
    await rm(join(tmpBase, "jobs", "job-alice"), { recursive: true, force: true });
    await rm(join(archiveBase, "jobs", "job-alice"), { recursive: true, force: true });

    const response = await app.request("http://localhost/api/admin/archives/import", {
      method: "POST",
      headers: { "Content-Type": "application/zip", Cookie: adminCookie },
      body: zipBytes
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      importedJobs: 1,
      importedImages: 1,
      skippedExistingJobs: 0
    });

    const restored = JSON.parse(
      await readFile(join(archiveBase, "jobs", "job-alice", "job.json"), "utf8")
    ) as JobRecord;
    expect(restored).toMatchObject({ jobId: "job-alice", createdBy: "alice", isArchived: true, expiresAt: null });
    expect(restored.pinnedImageIndices).toEqual([0]);
    await expect(stat(join(archiveBase, "jobs", "job-alice", "aaaa1111-0.png"))).resolves.toBeTruthy();

    // manifest.json sits outside jobs/ and is counted as ignored, not extracted.
    const repeat = await app.request("http://localhost/api/admin/archives/import", {
      method: "POST",
      headers: { "Content-Type": "application/zip", Cookie: adminCookie },
      body: zipBytes
    });
    expect(await repeat.json()).toMatchObject({ ok: true, importedJobs: 0, skippedExistingJobs: 1, ignoredEntries: 1 });
  });
});
