import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { JobRecord } from "../../src/shared/contracts/jobs";

type JobStoreModule = typeof import("../../src/server/lib/jobStore");

let jobStore: JobStoreModule;
let tmpBase: string;
let archiveBase: string;

function makeJobRecord(overrides: Partial<JobRecord> & { jobId: string; displayName: string }): JobRecord {
  return {
    endpointId: "endpoint-1",
    workflowFileName: null,
    submittedAt: new Date().toISOString(),
    completedAt: null,
    expiresAt: null,
    status: "COMPLETED",
    isTerminal: true,
    imageCount: 1,
    lastError: null,
    ...overrides,
  };
}

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), "manifest-tmp-"));
  archiveBase = await mkdtemp(join(tmpdir(), "manifest-archive-"));
  process.env.JOBS_TMP_DIR = tmpBase;
  process.env.JOBS_ARCHIVE_DIR = archiveBase;

  vi.resetModules();
  jobStore = await import("../../src/server/lib/jobStore");
  await jobStore.ensureJobStoreDirs();
});

afterEach(async () => {
  delete process.env.JOBS_TMP_DIR;
  delete process.env.JOBS_ARCHIVE_DIR;
  await rm(tmpBase, { recursive: true, force: true });
  await rm(archiveBase, { recursive: true, force: true });
});

async function writeArchiveJob(record: JobRecord): Promise<void> {
  const dir = join(archiveBase, "jobs", record.jobId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "job.json"), JSON.stringify({ ...record, isArchived: true }, null, 2), "utf8");
}

describe("listManifestImages", () => {
  it("returns one entry per job with a record per on-disk image across tmp + archive", async () => {
    const tmpJob = makeJobRecord({ jobId: "job-tmp", displayName: "aaaa1111", imageCount: 1 });
    await jobStore.createJob(tmpJob, { draftValues: {}, submittedInput: {} });
    await writeFile(jobStore.getJobImagePath("job-tmp", "aaaa1111-0.png"), Buffer.from("tmp-image"));

    const archiveJob = makeJobRecord({
      jobId: "job-arc",
      displayName: "bbbb2222",
      imageCount: 1,
      pinnedImageIndices: [0],
    });
    await writeArchiveJob(archiveJob);
    await writeFile(jobStore.getJobImagePath("job-arc", "bbbb2222-0.png", true), Buffer.from("archive-image"));

    const manifest = await jobStore.listManifestImages();

    expect(manifest).toHaveLength(2);

    const tmpEntry = manifest.find((e) => e.jobId === "job-tmp");
    expect(tmpEntry?.images).toHaveLength(1);
    expect(tmpEntry?.images[0]).toMatchObject({
      imageIndex: 0,
      fileName: "aaaa1111-0.png",
      relPath: "jobs/job-tmp/aaaa1111-0.png",
      mimeType: "image/png",
      isArchived: false,
      isPinned: false,
    });
    expect(tmpEntry?.images[0]?.sizeBytes).toBeGreaterThan(0);

    const archiveEntry = manifest.find((e) => e.jobId === "job-arc");
    expect(archiveEntry?.images).toHaveLength(1);
    expect(archiveEntry?.images[0]).toMatchObject({
      imageIndex: 0,
      isArchived: true,
      isPinned: true,
    });
  });
});

describe("deleteJobImage", () => {
  it("removes an image from both tmp and archive and is idempotent", async () => {
    const job = makeJobRecord({ jobId: "job-dual", displayName: "cccc3333", imageCount: 1 });
    await jobStore.createJob(job, { draftValues: {}, submittedInput: {} });
    await writeArchiveJob(job);
    await writeFile(jobStore.getJobImagePath("job-dual", "cccc3333-0.png"), Buffer.from("tmp"));
    await writeFile(jobStore.getJobImagePath("job-dual", "cccc3333-0.png", true), Buffer.from("archive"));

    const removed = await jobStore.deleteJobImage("job-dual", 0);
    expect(removed).toBe(true);

    const manifest = await jobStore.listManifestImages();
    const entry = manifest.find((e) => e.jobId === "job-dual");
    expect(entry?.images).toHaveLength(0);

    const second = await jobStore.deleteJobImage("job-dual", 0);
    expect(second).toBe(false);
  });

  it("clears the deleted index from pinnedImageIndices in job.json", async () => {
    const job = makeJobRecord({
      jobId: "job-pinned",
      displayName: "dddd4444",
      imageCount: 2,
      pinnedImageIndices: [0, 1],
    });
    await jobStore.createJob(job, { draftValues: {}, submittedInput: {} });
    await writeFile(jobStore.getJobImagePath("job-pinned", "dddd4444-0.png"), Buffer.from("tmp"));

    const removed = await jobStore.deleteJobImage("job-pinned", 0);
    expect(removed).toBe(true);

    const raw = await readFile(join(tmpBase, "jobs", "job-pinned", "job.json"), "utf8");
    const updated = JSON.parse(raw) as JobRecord;
    expect(updated.pinnedImageIndices).toEqual([1]);
  });
});

describe("purgeExpiredJobs", () => {
  it("deletes an expired job that has no pinned images", async () => {
    const job = makeJobRecord({
      jobId: "job-plain",
      displayName: "eeee5555",
      imageCount: 1,
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    await jobStore.createJob(job, { draftValues: {}, submittedInput: {} });
    await writeFile(jobStore.getJobImagePath("job-plain", "eeee5555-0.png"), Buffer.from("tmp"));

    const deleted = await jobStore.purgeExpiredJobs();

    expect(deleted).toContain("job-plain");
    expect(await jobStore.readJob("job-plain")).toBeNull();
  });

  it("preserves an expired job with pinned images and only purges its unpinned images", async () => {
    const job = makeJobRecord({
      jobId: "job-mixed",
      displayName: "ffff6666",
      imageCount: 2,
      pinnedImageIndices: [0],
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    await jobStore.createJob(job, { draftValues: {}, submittedInput: {} });
    // Pinned image lives in archive; unpinned image lives in tmp.
    await mkdir(join(archiveBase, "jobs", "job-mixed"), { recursive: true });
    await writeFile(jobStore.getJobImagePath("job-mixed", "ffff6666-0.png", true), Buffer.from("archive"));
    await writeFile(jobStore.getJobImagePath("job-mixed", "ffff6666-1.png"), Buffer.from("tmp"));

    const deleted = await jobStore.purgeExpiredJobs();

    expect(deleted).not.toContain("job-mixed");

    const survived = await jobStore.readJob("job-mixed");
    expect(survived).not.toBeNull();
    expect(survived?.pinnedImageIndices).toEqual([0]);
    expect(survived?.deletedImageIndices).toContain(1);
    expect(survived?.expiresAt).toBeNull();

    // Pinned archive image must still be present.
    await expect(
      readFile(jobStore.getJobImagePath("job-mixed", "ffff6666-0.png", true), "utf8")
    ).resolves.toBe("archive");
    // Unpinned tmp image must be gone.
    await expect(
      readFile(jobStore.getJobImagePath("job-mixed", "ffff6666-1.png"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

