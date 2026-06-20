import type { JobOutputImageMimeType, RecentJobOutputCluster, RecentJobOutputImage, RecentJobRecord } from "../../shared/contracts/jobs";
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

  let extractedImages: Array<{ dataUrl: string; mimeType: JobOutputImageMimeType; sourcePath: string }>;

  if (job.lastResponse) {
    extractedImages = extractRunpodOutputImages(job.lastResponse);
  } else if ((job.outputImageCount ?? 0) > 0) {
    extractedImages = Array.from({ length: job.outputImageCount! }, (_, i) => ({
      dataUrl: `/api/jobs/${job.jobId}/images/${i}`,
      mimeType: "image/png" as JobOutputImageMimeType,
      sourcePath: `/api/jobs/${job.jobId}/images/${i}`,
    }));
  } else {
    return null;
  }

  if (extractedImages.length === 0) {
    return null;
  }

  const hiddenSet = new Set<number>(job.hiddenOutputIndices ?? []);
  const pinnedSet = new Set<number>(job.pinnedOutputIndices ?? []);
  const allVisibleOutputs: RecentJobOutputImage[] = extractedImages
    .map((image, index) => ({
      dataUrl: image.dataUrl,
      mimeType: image.mimeType,
      sourcePath: image.sourcePath,
      outputIndex: index,
      isPinned: pinnedSet.has(index)
    }))
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
