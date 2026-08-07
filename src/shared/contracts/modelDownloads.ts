export type DownloadSource = "civitai" | "huggingface";

export type DownloadStatus = "queued" | "in_progress" | "finished" | "cancelled" | "failed";

export type DownloadEntry = {
  id: string;
  source: DownloadSource;
  url: string;
  destPath: string;
  filename: string;
  status: DownloadStatus;
  bytesDownloaded: number;
  totalBytes: number;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};
