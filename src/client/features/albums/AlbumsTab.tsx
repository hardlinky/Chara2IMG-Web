import { useEffect, useMemo, useState } from "react";
import type { Album } from "../../../shared/contracts/albums";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";
import { OutputLightbox } from "../outputs/OutputLightbox";
import { formatOutputJobId } from "../outputs/formatOutputJobId";
import { confirmDeletion } from "../../lib/confirmDelete";
import { filterJobsByOwner, type RecentJobOwnerFilter } from "../jobs/useRecentJobs";
import "../../styles/albums.css";

type AlbumsTabProps = {
  active?: boolean;
  albums: Album[];
  isLoading: boolean;
  error: string | null;
  selectedAlbumId: string | null;
  onSelectAlbum: (albumId: string | null) => void;
  onUpdateAlbum: (id: string, updates: { name?: string; description?: string; isPublished?: boolean }) => Promise<Album>;
  onDeleteAlbum: (id: string) => Promise<void>;
  onRemoveImage: (id: string, jobId: string, imageIndex: number) => Promise<Album | null>;
  onViewJob: (jobId: string) => void;
  onTogglePinImage: (jobId: string, imageIndex: number, pinned: boolean) => Promise<{ ok: boolean }>;
  currentUser: string | null;
};

function imageUrl(jobId: string, imageIndex: number): string {
  return `/api/jobs/${encodeURIComponent(jobId)}/images/${imageIndex}`;
}

function AlbumGrid({
  albums,
  onSelectAlbum
}: {
  albums: Album[];
  onSelectAlbum: (albumId: string) => void;
}) {
  return (
    <ul className="albums-grid">
      {albums.map((album) => {
        const cover = album.images[0];
        return (
          <li key={album.id}>
            <button className="albums-card" type="button" onClick={() => onSelectAlbum(album.id)}>
              {cover ? (
                <img
                  className="albums-card-cover"
                  src={imageUrl(cover.jobId, cover.imageIndex)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="albums-card-cover-empty">No images</span>
              )}
              <span className="albums-card-body">
                <span className="albums-card-name">{album.name}</span>
                <span className="albums-card-count">
                  {album.images.length} {album.images.length === 1 ? "image" : "images"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AlbumView({
  active,
  album,
  onBack,
  onUpdateAlbum,
  onDeleteAlbum,
  onRemoveImage,
  onViewJob,
  onTogglePinImage,
  onPreviousAlbum,
  onNextAlbum,
  currentUser
}: {
  active: boolean;
  album: Album;
  onBack: () => void;
  onUpdateAlbum: AlbumsTabProps["onUpdateAlbum"];
  onDeleteAlbum: AlbumsTabProps["onDeleteAlbum"];
  onRemoveImage: AlbumsTabProps["onRemoveImage"];
  onViewJob: AlbumsTabProps["onViewJob"];
  onTogglePinImage: AlbumsTabProps["onTogglePinImage"];
  onPreviousAlbum?: () => void;
  onNextAlbum?: () => void;
  currentUser: string | null;
}) {
  const canManage = album.createdBy === null || album.createdBy === currentUser;
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(album.name);
  const [descDraft, setDescDraft] = useState(album.description);
  const [pinningKeys, setPinningKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setNameDraft(album.name);
    setDescDraft(album.description);
    setIsEditing(false);
  }, [album.id, album.name, album.description]);

  const images = useMemo<RecentJobOutputImage[]>(
    () =>
      album.images.map((ref) => ({
        dataUrl: imageUrl(ref.jobId, ref.imageIndex),
        mimeType: "image/png",
        sourcePath: `${ref.jobId}:${ref.imageIndex}`,
        outputIndex: ref.imageIndex,
        isPinned: ref.isPinned ?? false
      })),
    [album.images]
  );

  async function togglePin(jobId: string, imageIndex: number, pinned: boolean): Promise<void> {
    const key = `${jobId}:${imageIndex}`;
    setPinningKeys((prev) => new Set(prev).add(key));
    try {
      await onTogglePinImage(jobId, imageIndex, pinned);
    } finally {
      setPinningKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const perImageActions = {
    jobId: (index: number) => album.images[index]!.jobId,
    displayPrefix: (index: number) => formatOutputJobId(album.images[index]!.jobId),
    badge: (index: number) => album.images[index]!.createdBy ?? "Anon",
    onViewJob: (index: number) => {
      // Non-owned albums may be viewed (if published) but job navigation is not allowed.
      if (!canManage) {
        return;
      }
      onViewJob(album.images[index]!.jobId);
    },
    onRemove: canManage
      ? (index: number) => {
          const ref = album.images[index]!;
          void onRemoveImage(album.id, ref.jobId, ref.imageIndex);
        }
      : undefined,
    onTogglePin: canManage
      ? (index: number, pinned: boolean) => {
          const ref = album.images[index]!;
          void togglePin(ref.jobId, ref.imageIndex, pinned);
        }
      : undefined,
    isPinningAt: (index: number) => {
      const ref = album.images[index]!;
      return pinningKeys.has(`${ref.jobId}:${ref.imageIndex}`);
    }
  };

  async function saveEdits(): Promise<void> {
    const name = nameDraft.trim();
    if (name.length === 0) {
      return;
    }
    await onUpdateAlbum(album.id, { name, description: descDraft.trim() });
    setIsEditing(false);
  }

  return (
    <div className="album-view">
      <div className="album-view-header">
        <div className="album-view-header-top">
          <button className="btn btn-secondary" type="button" onClick={onBack}>
            ← Albums
          </button>
          {!isEditing ? <h2 className="album-view-title">{album.name}</h2> : null}
          {!isEditing ? (
            <span className="album-owner-label">
              by {album.createdBy === null ? "Anon" : album.createdBy === currentUser ? "You" : album.createdBy}
            </span>
          ) : null}
          {!isEditing && album.isPublished ? <span className="album-published-badge">Published</span> : null}
          <div className="album-view-actions">
            {isEditing ? (
              <>
                <button className="btn btn-primary" type="button" onClick={() => void saveEdits()}>
                  Save
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
              </>
            ) : canManage ? (
              <>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void onUpdateAlbum(album.id, { isPublished: !album.isPublished })}
                >
                  {album.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setIsEditing(true)}>
                  Edit
                </button>
                <button
                  className="btn btn-destructive"
                  type="button"
                  onClick={() => {
                    void confirmDeletion({ message: "Delete this album? This can't be undone.", confirmLabel: "Delete album" }).then((ok) => {
                      if (ok) void onDeleteAlbum(album.id).then(onBack);
                    });
                  }}
                >
                  Delete album
                </button>
              </>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <div className="section-stack">
            <input
              className="input"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              maxLength={100}
              aria-label="Album name"
            />
            <textarea
              className="input"
              value={descDraft}
              onChange={(event) => setDescDraft(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Description (optional)"
              aria-label="Album description"
            />
          </div>
        ) : album.description ? (
          <p className="album-view-desc">{album.description}</p>
        ) : null}
      </div>

      {album.images.length === 0 ? (
        <p className="albums-empty">This album is empty.</p>
      ) : (
        <div className="outputs-gallery outputs-gallery-comfortable">
          <OutputLightbox
            active={active}
            images={images}
            imagePrefix={album.id}
            perImageActions={perImageActions}
            onPreviousJob={onPreviousAlbum}
            onNextJob={onNextAlbum}
            enableJobNav
          />
        </div>
      )}
    </div>
  );
}

export function AlbumsTab({
  active = true,
  albums,
  isLoading,
  error,
  selectedAlbumId,
  onSelectAlbum,
  onUpdateAlbum,
  onDeleteAlbum,
  onRemoveImage,
  onViewJob,
  onTogglePinImage,
  currentUser
}: AlbumsTabProps) {
  const [ownerFilter, setOwnerFilter] = useState<RecentJobOwnerFilter>("all");
  const selectedAlbum = selectedAlbumId ? albums.find((album) => album.id === selectedAlbumId) ?? null : null;

  if (selectedAlbum) {
    const currentIndex = albums.findIndex((album) => album.id === selectedAlbum.id);
    const previousAlbum = currentIndex > 0 ? albums[currentIndex - 1] : undefined;
    const nextAlbum = currentIndex >= 0 && currentIndex + 1 < albums.length ? albums[currentIndex + 1] : undefined;
    return (
      <AlbumView
        active={active}
        album={selectedAlbum}
        onBack={() => onSelectAlbum(null)}
        onUpdateAlbum={onUpdateAlbum}
        onDeleteAlbum={onDeleteAlbum}
        onRemoveImage={onRemoveImage}
        onViewJob={onViewJob}
        onTogglePinImage={onTogglePinImage}
        onPreviousAlbum={previousAlbum ? () => onSelectAlbum(previousAlbum.id) : undefined}
        onNextAlbum={nextAlbum ? () => onSelectAlbum(nextAlbum.id) : undefined}
        currentUser={currentUser}
      />
    );
  }

  const filteredAlbums = filterJobsByOwner(albums, ownerFilter, currentUser);

  return (
    <div className="albums-panel">
      <div className="albums-panel-header">
        <h2>Albums</h2>
        <label className="field">
          Owner
          <select className="select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value as RecentJobOwnerFilter)}>
            <option value="all">All</option>
            <option value="own">Mine</option>
            <option value="anonymous">Anon</option>
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="status-inline" data-tone="error">
          {error}
        </p>
      ) : null}
      {isLoading && albums.length === 0 ? (
        <p className="albums-empty">Loading albums…</p>
      ) : filteredAlbums.length === 0 ? (
        <p className="albums-empty">
          {albums.length === 0
            ? "No albums yet. Add images to an album using the ⭐ button in the Output view."
            : "No albums match the selected owner filter."}
        </p>
      ) : (
        <AlbumGrid albums={filteredAlbums} onSelectAlbum={onSelectAlbum} />
      )}
    </div>
  );
}
