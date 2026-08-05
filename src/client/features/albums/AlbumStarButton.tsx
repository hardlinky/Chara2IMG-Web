import { useEffect, useRef, useState } from "react";
import type { AlbumStarProps } from "./albumStar";
import "../../styles/albums.css";

type AlbumStarButtonProps = AlbumStarProps & {
  label: string;
};

export function AlbumStarButton({ albums, memberAlbumIds, onToggleAlbum, onCreateAlbum, label }: AlbumStarButtonProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isMember = memberAlbumIds.length > 0;
  const memberSet = new Set(memberAlbumIds);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onDocPointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  function handleCreate(): void {
    const name = newName.trim();
    if (name.length === 0) {
      return;
    }
    onCreateAlbum(name);
    setNewName("");
  }

  return (
    <div className="album-star" ref={containerRef}>
      <button
        type="button"
        className={`album-star-btn ${isMember ? "is-member" : ""}`.trim()}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {isMember ? "★" : "☆"}
      </button>
      {open ? (
        <div className="album-star-popover" role="dialog" onClick={(event) => event.stopPropagation()}>
          <p className="album-star-popover-title">Add to album</p>
          {albums.length > 0 ? (
            <ul className="album-star-list">
              {albums.map((album) => (
                <li key={album.id}>
                  <label className="album-star-option">
                    <input
                      type="checkbox"
                      checked={memberSet.has(album.id)}
                      onChange={(event) => onToggleAlbum(album.id, event.target.checked)}
                    />
                    <span>{album.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="album-star-empty">No albums yet.</p>
          )}
          <div className="album-star-create">
            <input
              className="input"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="New album name"
              maxLength={100}
              aria-label="New album name"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={newName.trim().length === 0}
            >
              Create
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
