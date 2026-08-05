import type { JobOutputImageMimeType, RecentJobOutputCluster, RecentJobOutputImage, RecentJobRecord } from "../../shared/contracts/jobs";
import { JOB_IMAGE_TTL_MS } from "../../shared/contracts/jobs";
import { extractRunpodOutputImages } from "./runpodOutputImage";

type ProjectionOptions = {
  maxOutputsPerJob?: number;
};

function isCompletedJob(job: RecentJobRecord): boolean {
  return job.lifecycle.status === "COMPLETED" && job.lifecycle.isTerminal;
}

function getClusterSortTimestamp(job: RecentJobRecord): number {
  const value = job.lifecycle.finishedAt ?? job.submittedAt;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function projectJobOutputCluster(job: RecentJobRecord, options: ProjectionOptions = {}): RecentJobOutputCluster | null {
  if (!isCompletedJob(job)) {
    return null;
  }

  if (job.outputsHidden) {
    return null;
  }

  let extractedImages: Array<{ dataUrl: string; mimeType: JobOutputImageMimeType; sourcePath: string; outputIndex?: number }>;

  if (job.lastResponse) {
    extractedImages = extractRunpodOutputImages(job.lastResponse);
  } else {
    // Prefer the server's list of image indices that actually exist on disk so we
    // never request URLs for images the backend has already purged. Fall back to a
    // contiguous range only for older payloads that carry just a count.
    const indices =
      job.availableImageIndices ??
      ((job.outputImageCount ?? 0) > 0
        ? Array.from({ length: job.outputImageCount! }, (_, i) => i)
        : []);
    if (indices.length === 0) {
      return null;
    }
    extractedImages = indices.map((imageIndex) => ({
      dataUrl: `/api/jobs/${job.jobId}/images/${imageIndex}`,
      mimeType: "image/png" as JobOutputImageMimeType,
      sourcePath: `/api/jobs/${job.jobId}/images/${imageIndex}`,
      outputIndex: imageIndex,
    }));
  }

  if (extractedImages.length === 0) {
    return null;
  }

  const hiddenSet = new Set<number>(job.hiddenOutputIndices ?? []);
  const pinnedSet = new Set<number>(job.pinnedOutputIndices ?? []);

  // Job-level TTL baseline for non-pinned URL-based images.
  const jobLevelCacheExpiresAt =
    !job.lastResponse && job.lifecycle.finishedAt
      ? Date.parse(job.lifecycle.finishedAt) + JOB_IMAGE_TTL_MS
      : undefined;

  const allVisibleOutputs: RecentJobOutputImage[] = extractedImages
    .map((image, index) => {
      const outputIndex = image.outputIndex ?? index;
      const isPinned = pinnedSet.has(outputIndex);

      let cacheExpiresAt: number | undefined;

      if (isPinned) {
        // Check for an active unarchive expiry (image was unpinned and is counting down)
        const unarchiveIso = job.imageUnarchiveExpiries?.[String(outputIndex)];
        if (unarchiveIso) {
          // Unpin countdown: show progress bar until this expiry
          cacheExpiresAt = Date.parse(unarchiveIso);
        } else {
          // No unarchive expiry + isPinned → archived state (TTL expired while pinned)
          cacheExpiresAt = undefined;
        }
      } else {
        // Unpinned image: prefer an active unarchive countdown (set at unpin time),
        // falling back to the job-level TTL for never-pinned images.
        const unarchiveIso = job.imageUnarchiveExpiries?.[String(outputIndex)];
        cacheExpiresAt = unarchiveIso ? Date.parse(unarchiveIso) : jobLevelCacheExpiresAt;
      }

      return {
        dataUrl: image.dataUrl,
        mimeType: image.mimeType,
        sourcePath: image.sourcePath,
        outputIndex,
        isPinned,
        cacheExpiresAt,
      };
    })
    .filter((image) => !hiddenSet.has(image.outputIndex));

  if (allVisibleOutputs.length === 0) {
    return null;
  }

  const maxOutputsPerJob = options.maxOutputsPerJob ?? Number.POSITIVE_INFINITY;
  const outputs = allVisibleOutputs.slice(0, Math.max(1, maxOutputsPerJob));

  return {
    jobId: job.jobId,
    isPinned: Boolean(job.pinnedAt) || Boolean(job.pinnedOutputIndices?.length),
    endpointId: job.endpointId,
    submittedAt: job.submittedAt,
    finishedAt: job.lifecycle.finishedAt ?? null,
    workflowFileName: job.provenance.workflowFileName,
    outputCount: job.outputImageCount ?? allVisibleOutputs.length,
    representative: allVisibleOutputs[0],
    outputs
  };
}

export function projectRecentJobOutputClusters(jobs: RecentJobRecord[], options: ProjectionOptions = {}): RecentJobOutputCluster[] {
  const clusters = jobs
    .map((job) => projectJobOutputCluster(job, options))
    .filter((cluster): cluster is RecentJobOutputCluster => Boolean(cluster));

  return clusters.sort((left, right) => {
    const rightTimestamp = jobs.find((job) => job.jobId === right.jobId);
    const leftTimestamp = jobs.find((job) => job.jobId === left.jobId);

    const rightValue = rightTimestamp ? getClusterSortTimestamp(rightTimestamp) : 0;
    const leftValue = leftTimestamp ? getClusterSortTimestamp(leftTimestamp) : 0;

    return rightValue - leftValue;
  });
}
