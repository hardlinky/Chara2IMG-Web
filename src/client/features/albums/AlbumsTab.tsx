import { useEffect, useState } from "react";
import type { Album } from "../../../shared/contracts/albums";
import "../../styles/albums.css";

type AlbumsTabProps = {
  albums: Album[];
  isLoading: boolean;
  error: string | null;
  selectedAlbumId: string | null;
  onSelectAlbum: (albumId: string | null) => void;
  onUpdateAlbum: (id: string, updates: { name?: string; description?: string }) => Promise<Album>;
  onDeleteAlbum: (id: string) => Promise<void>;
  onRemoveImage: (id: string, jobId: string, imageIndex: number) => Promise<Album | null>;
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
  album,
  onBack,
  onUpdateAlbum,
  onDeleteAlbum,
  onRemoveImage
}: {
  album: Album;
  onBack: () => void;
  onUpdateAlbum: AlbumsTabProps["onUpdateAlbum"];
  onDeleteAlbum: AlbumsTabProps["onDeleteAlbum"];
  onRemoveImage: AlbumsTabProps["onRemoveImage"];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(album.name);
  const [descDraft, setDescDraft] = useState(album.description);

  useEffect(() => {
    setNameDraft(album.name);
    setDescDraft(album.description);
    setIsEditing(false);
  }, [album.id, album.name, album.description]);

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
            ) : (
              <>
                <button className="btn btn-secondary" type="button" onClick={() => setIsEditing(true)}>
                  Edit
                </button>
                <button
                  className="btn btn-destructive"
                  type="button"
                  onClick={() => {
                    void onDeleteAlbum(album.id).then(onBack);
                  }}
                >
                  Delete album
                </button>
              </>
            )}
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
        <ul className="album-images-grid">
          {album.images.map((ref) => (
            <li key={`${ref.jobId}:${ref.imageIndex}`} className="album-image-cell">
              <img src={imageUrl(ref.jobId, ref.imageIndex)} alt="" loading="lazy" />
              <button
                className="album-image-remove"
                type="button"
                aria-label="Remove from album"
                title="Remove from album"
                onClick={() => void onRemoveImage(album.id, ref.jobId, ref.imageIndex)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AlbumsTab({
  albums,
  isLoading,
  error,
  selectedAlbumId,
  onSelectAlbum,
  onUpdateAlbum,
  onDeleteAlbum,
  onRemoveImage
}: AlbumsTabProps) {
  const selectedAlbum = selectedAlbumId ? albums.find((album) => album.id === selectedAlbumId) ?? null : null;

  if (selectedAlbum) {
    return (
      <AlbumView
        album={selectedAlbum}
        onBack={() => onSelectAlbum(null)}
        onUpdateAlbum={onUpdateAlbum}
        onDeleteAlbum={onDeleteAlbum}
        onRemoveImage={onRemoveImage}
      />
    );
  }

  return (
    <div className="albums-panel">
      <div className="albums-panel-header">
        <h2>Albums</h2>
      </div>
      {error ? (
        <p role="alert" className="status-inline" data-tone="error">
          {error}
        </p>
      ) : null}
      {isLoading && albums.length === 0 ? (
        <p className="albums-empty">Loading albums…</p>
      ) : albums.length === 0 ? (
        <p className="albums-empty">
          No albums yet. Add images to an album using the ⭐ button in the Output view.
        </p>
      ) : (
        <AlbumGrid albums={albums} onSelectAlbum={onSelectAlbum} />
      )}
    </div>
  );
}
