import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { JobRecord } from "../../src/shared/contracts/jobs";

type JobStoreModule = typeof import("../../src/server/lib/jobStore");

let jobStore: JobStoreModule;
let tmpBase: string;
let archiveBase: string;

function makeJobRecord(jobId: string): JobRecord {
  return {
    jobId,
    displayName: "abcd1234",
    endpointId: "endpoint-1",
    workflowFileName: null,
    submittedAt: "2026-08-12T00:00:00.000Z",
    completedAt: null,
    expiresAt: null,
    status: "COMPLETED",
    isTerminal: true,
    imageCount: 0,
    lastError: null,
  };
}

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), "job-store-tmp-"));
  archiveBase = await mkdtemp(join(tmpdir(), "job-store-archive-"));
  process.env.JOBS_TMP_DIR = tmpBase;
  process.env.JOBS_ARCHIVE_DIR = archiveBase;

  vi.resetModules();
  jobStore = await import("../../src/server/lib/jobStore");
  await jobStore.ensureJobStoreDirs();
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.JOBS_TMP_DIR;
  delete process.env.JOBS_ARCHIVE_DIR;
  await rm(tmpBase, { recursive: true, force: true });
  await rm(archiveBase, { recursive: true, force: true });
});

describe("malformed job metadata", () => {
  it("skips a malformed temporary record when listing jobs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const jobDir = join(tmpBase, "jobs", "broken-job");
    await mkdir(jobDir, { recursive: true });
    await writeFile(join(jobDir, "job.json"), "", "utf8");

    await expect(jobStore.listJobs()).resolves.toEqual([]);
    await expect(jobStore.listJobs()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("falls back to archived metadata when the temporary record is malformed", async () => {
    const jobId = "archived-job";
    const tmpJobDir = join(tmpBase, "jobs", jobId);
    const archiveJobDir = join(archiveBase, "jobs", jobId);
    await Promise.all([
      mkdir(tmpJobDir, { recursive: true }),
      mkdir(archiveJobDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(tmpJobDir, "job.json"), "{", "utf8"),
      writeFile(join(archiveJobDir, "job.json"), JSON.stringify(makeJobRecord(jobId)), "utf8"),
    ]);

    await expect(jobStore.readJobAnywhere(jobId)).resolves.toMatchObject({ jobId });
  });
});