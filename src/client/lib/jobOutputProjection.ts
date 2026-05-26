import type { RecentJobOutputCluster, RecentJobOutputImage, RecentJobRecord } from "../../shared/contracts/jobs";
import { extractRunpodOutputImages } from "./runpodOutputImage";

function isCompletedJob(job: RecentJobRecord): boolean {
  return job.lifecycle.status === "COMPLETED" && job.lifecycle.isTerminal;
}

function getClusterSortTimestamp(job: RecentJobRecord): number {
  const value = job.lifecycle.finishedAt ?? job.submittedAt;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function projectJobOutputCluster(job: RecentJobRecord): RecentJobOutputCluster | null {
  if (!isCompletedJob(job) || !job.lastResponse) {
    return null;
  }

  if (job.outputsHidden) {
    return null;
  }

  const extractedImages = extractRunpodOutputImages(job.lastResponse);
  if (extractedImages.length === 0) {
    return null;
  }

  const hiddenSet = new Set<number>(job.hiddenOutputIndices ?? []);
  const outputs: RecentJobOutputImage[] = extractedImages
    .map((image, index) => ({
      dataUrl: image.dataUrl,
      mimeType: image.mimeType,
      sourcePath: image.sourcePath,
      outputIndex: index
    }))
    .filter((image) => !hiddenSet.has(image.outputIndex));

  if (outputs.length === 0) {
    return null;
  }

  return {
    jobId: job.jobId,
    isPinned: Boolean(job.pinnedAt),
    endpointId: job.endpointId,
    submittedAt: job.submittedAt,
    finishedAt: job.lifecycle.finishedAt ?? null,
    workflowFileName: job.provenance.workflowFileName,
    outputCount: outputs.length,
    representative: outputs[0],
    outputs
  };
}

export function projectRecentJobOutputClusters(jobs: RecentJobRecord[]): RecentJobOutputCluster[] {
  const clusters = jobs
    .map(projectJobOutputCluster)
    .filter((cluster): cluster is RecentJobOutputCluster => Boolean(cluster));

  return clusters.sort((left, right) => {
    const rightTimestamp = jobs.find((job) => job.jobId === right.jobId);
    const leftTimestamp = jobs.find((job) => job.jobId === left.jobId);

    const rightValue = rightTimestamp ? getClusterSortTimestamp(rightTimestamp) : 0;
    const leftValue = leftTimestamp ? getClusterSortTimestamp(leftTimestamp) : 0;

    return rightValue - leftValue;
  });
}
