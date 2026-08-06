import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AlbumStarProps } from "./albumStar";
import { filterJobsByOwner, type RecentJobOwnerFilter } from "../jobs/useRecentJobs";
import "../../styles/albums.css";

type AlbumStarButtonProps = AlbumStarProps & {
  label: string;
};

export function AlbumStarButton({ albums, memberAlbumIds, currentUser, onToggleAlbum, onCreateAlbum, label }: AlbumStarButtonProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<RecentJobOwnerFilter>("all");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const isMember = memberAlbumIds.length > 0;
  const memberSet = new Set(memberAlbumIds);
  const visibleAlbums = filterJobsByOwner(albums, ownerFilter, currentUser);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onDocPointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  // Portal + viewport clamp so the popover escapes the card's overflow bounds.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      return;
    }
    const button = buttonRef.current;

    function place(): void {
      const rect = button.getBoundingClientRect();
      const margin = 8;
      const width = popoverRef.current?.offsetWidth ?? 220;
      const height = popoverRef.current?.offsetHeight ?? 240;
      let left = rect.left;
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - margin - width;
      }
      if (left < margin) {
        left = margin;
      }
      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - margin) {
        const above = rect.top - 4 - height;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - margin - height);
      }
      setPosition({ top, left });
    }

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
    }
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
        ref={buttonRef}
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
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="album-star-popover"
              role="dialog"
              style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: "hidden" }}
              onClick={(event) => event.stopPropagation()}
            >
              <p className="album-star-popover-title">Add to album</p>
              <label className="album-star-filter">
                <span>Owner</span>
                <select
                  className="select"
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value as RecentJobOwnerFilter)}
                >
                  <option value="all">All</option>
                  <option value="own">Mine</option>
                  <option value="anonymous">Anon</option>
                </select>
              </label>
              {visibleAlbums.length > 0 ? (
                <ul className="album-star-list">
                  {visibleAlbums.map((album) => (
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
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

