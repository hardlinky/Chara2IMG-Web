import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { JobRecord } from "../../src/shared/contracts/jobs";

function cookieFrom(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("anonymous album image visibility", () => {
  let tmpBase: string;
  let archiveBase: string;

  beforeEach(async () => {
    tmpBase = await mkdtemp(join(tmpdir(), "album-image-tmp-"));
    archiveBase = await mkdtemp(join(tmpdir(), "album-image-archive-"));
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

  it("serves an anonymous job image to another anonymous invite session", async () => {
    const [{ createServerApp }, jobStore, albumStore] = await Promise.all([
      import("../../src/server/index"),
      import("../../src/server/lib/jobStore"),
      import("../../src/server/lib/albumStore")
    ]);
    await jobStore.ensureJobStoreDirs();
    const job: JobRecord = {
      jobId: "anonymous-job",
      displayName: "aabbccdd",
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
    await jobStore.createJob(job, { draftValues: {}, submittedInput: {} });
    await writeFile(jobStore.getJobImagePath(job.jobId, `${job.displayName}-0.png`), Buffer.from("image-bytes"));
    await albumStore.createAlbum({
      name: "Anonymous album",
      jobId: job.jobId,
      imageIndex: 0,
      createdBy: null
    });

    const app = createServerApp();
    const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite: "invite-test" })
    });
    const response = await app.request("http://localhost/api/jobs/anonymous-job/images/0", {
      headers: { Cookie: cookieFrom(inviteResponse) }
    });

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("image-bytes");
  });

  it("serves an image in a visible anonymous album regardless of job ownership", async () => {
    const [{ createServerApp }, jobStore, albumStore] = await Promise.all([
      import("../../src/server/index"),
      import("../../src/server/lib/jobStore"),
      import("../../src/server/lib/albumStore")
    ]);
    await jobStore.ensureJobStoreDirs();
    const job: JobRecord = {
      jobId: "owned-job-in-anonymous-album",
      displayName: "eeff0011",
      endpointId: "endpoint-1",
      workflowFileName: null,
      submittedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      expiresAt: null,
      status: "COMPLETED",
      isTerminal: true,
      imageCount: 1,
      lastError: null,
      createdBy: "uploader"
    };
    await jobStore.createJob(job, { draftValues: {}, submittedInput: {} });
    await writeFile(jobStore.getJobImagePath(job.jobId, `${job.displayName}-0.png`), Buffer.from("shared-image"));
    await albumStore.createAlbum({
      name: "Shared anonymous album",
      jobId: job.jobId,
      imageIndex: 0,
      createdBy: null
    });

    const app = createServerApp();
    const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite: "invite-test" })
    });
    const response = await app.request("http://localhost/api/jobs/owned-job-in-anonymous-album/images/0", {
      headers: { Cookie: cookieFrom(inviteResponse) }
    });

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("shared-image");

    const privateJob: JobRecord = {
      ...job,
      jobId: "private-owned-job",
      displayName: "22334455"
    };
    await jobStore.createJob(privateJob, { draftValues: {}, submittedInput: {} });
    await writeFile(
      jobStore.getJobImagePath(privateJob.jobId, `${privateJob.displayName}-0.png`),
      Buffer.from("private-image")
    );
    await albumStore.createAlbum({
      name: "Private album",
      jobId: privateJob.jobId,
      imageIndex: 0,
      createdBy: "uploader"
    });
    const privateResponse = await app.request("http://localhost/api/jobs/private-owned-job/images/0", {
      headers: { Cookie: cookieFrom(inviteResponse) }
    });

    expect(privateResponse.status).toBe(404);
  });
});