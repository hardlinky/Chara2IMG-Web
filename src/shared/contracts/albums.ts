export type AlbumImageRef = {
  jobId: string;
  imageIndex: number;
  addedAt: string;
  // Read-only enrichment from the server (present in API responses, never persisted).
  isPinned?: boolean;
};

export type Album = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  // Owner username, or null for anonymous albums (manageable by everyone).
  createdBy: string | null;
  // When true, the album's images are viewable by any user.
  isPublished: boolean;
  images: AlbumImageRef[];
};
