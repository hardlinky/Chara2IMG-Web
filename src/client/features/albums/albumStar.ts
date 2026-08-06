import type { Album } from "../../../shared/contracts/albums";

export type AlbumStarProps = {
  albums: Album[];
  memberAlbumIds: string[];
  currentUser: string | null;
  onToggleAlbum: (albumId: string, next: boolean) => void;
  onCreateAlbum: (name: string) => void;
};

// Threaded down through the outputs views; binds album mutations to a specific image.
export type AlbumStarContext = {
  albums: Album[];
  currentUser: string | null;
  onToggleImageInAlbum: (albumId: string, jobId: string, imageIndex: number, next: boolean) => void;
  onCreateAlbumWithImage: (name: string, jobId: string, imageIndex: number) => void;
};

export function buildAlbumStarProps(
  context: AlbumStarContext | undefined,
  jobId: string,
  imageIndex: number
): AlbumStarProps | undefined {
  if (!context) {
    return undefined;
  }

  const memberAlbumIds = context.albums
    .filter((album) => album.images.some((ref) => ref.jobId === jobId && ref.imageIndex === imageIndex))
    .map((album) => album.id);

  return {
    albums: context.albums,
    memberAlbumIds,
    currentUser: context.currentUser,
    onToggleAlbum: (albumId, next) => context.onToggleImageInAlbum(albumId, jobId, imageIndex, next),
    onCreateAlbum: (name) => context.onCreateAlbumWithImage(name, jobId, imageIndex)
  };
}
