import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { JobRecord } from "../../src/shared/contracts/jobs";

function cookieFrom(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("archived job inputs", () => {
  let tmpBase: string;
  let archiveBase: string;

  beforeEach(async () => {
    tmpBase = await mkdtemp(join(tmpdir(), "job-inputs-tmp-"));
    archiveBase = await mkdtemp(join(tmpdir(), "job-inputs-archive-"));
    process.env.JOBS_TMP_DIR = tmpBase;
    process.env.JOBS_ARCHIVE_DIR = archiveBase;
    process.env.INVITE_SECRET = "invite-test";
    process.env.COOKIE_SECRET = "cookie-secret-test";
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.JOBS_TMP_DIR;
    delete process.env.JOBS_ARCHIVE_DIR;
    delete process.env.INVITE_SECRET;
    delete process.env.COOKIE_SECRET;
    await rm(tmpBase, { recursive: true, force: true });
    await rm(archiveBase, { recursive: true, force: true });
  });

  it("loads inputs from archive after temporary job storage is gone", async () => {
    const [{ createServerApp }, jobStore] = await Promise.all([
      import("../../src/server/index"),
      import("../../src/server/lib/jobStore")
    ]);
    await jobStore.ensureJobStoreDirs();
    const job: JobRecord = {
      jobId: "archived-input-job",
      displayName: "1234abcd",
      endpointId: "endpoint-1",
      workflowFileName: null,
      submittedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      expiresAt: null,
      status: "COMPLETED",
      isTerminal: true,
      imageCount: 1,
      lastError: null,
      createdBy: null
    };
    const inputs = { draftValues: { prompt: "yesterday" }, submittedInput: { prompt: "yesterday" } };
    await jobStore.createJob(job, inputs);
    await writeFile(jobStore.getJobImagePath(job.jobId, `${job.displayName}-0.png`), Buffer.from("image"));
    expect(await jobStore.pinImage(job.jobId, 0)).toBe(true);
    await rm(join(tmpBase, "jobs", job.jobId), { recursive: true, force: true });

    const app = createServerApp();
    const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite: "invite-test" })
    });
    const response = await app.request("http://localhost/api/jobs/archived-input-job/inputs", {
      headers: { Cookie: cookieFrom(inviteResponse) }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, inputs });
  });
});