export type AlbumImageRef = {
  jobId: string;
  imageIndex: number;
  addedAt: string;
};

export type Album = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  // Reserved for future per-user scoping; always null while albums are global.
  createdBy: string | null;
  images: AlbumImageRef[];
};
