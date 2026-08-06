import type { Album } from "../../../shared/contracts/albums";

async function parseAlbumResponse(res: Response): Promise<Album> {
  const data = (await res.json()) as { ok: boolean; album: Album };
  return data.album;
}

export async function listAlbums(): Promise<Album[]> {
  const res = await fetch("/api/albums", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to list albums: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; albums: Album[] };
  return data.albums;
}

export async function createAlbum(input: {
  name: string;
  description?: string;
  jobId: string;
  imageIndex: number;
}): Promise<Album> {
  const res = await fetch("/api/albums", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error(`Failed to create album: ${res.status}`);
  return parseAlbumResponse(res);
}

export async function updateAlbum(
  id: string,
  updates: { name?: string; description?: string; isPublished?: boolean }
): Promise<Album> {
  const res = await fetch(`/api/albums/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error(`Failed to update album ${id}: ${res.status}`);
  return parseAlbumResponse(res);
}

export async function deleteAlbum(id: string): Promise<void> {
  const res = await fetch(`/api/albums/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!res.ok) throw new Error(`Failed to delete album ${id}: ${res.status}`);
}

export async function addImageToAlbum(
  id: string,
  jobId: string,
  imageIndex: number
): Promise<Album> {
  const res = await fetch(`/api/albums/${encodeURIComponent(id)}/images`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, imageIndex })
  });
  if (!res.ok) throw new Error(`Failed to add image to album ${id}: ${res.status}`);
  return parseAlbumResponse(res);
}

// Returns the updated album, or null when the album was emptied and removed.
export async function removeImageFromAlbum(
  id: string,
  jobId: string,
  imageIndex: number
): Promise<Album | null> {
  const res = await fetch(
    `/api/albums/${encodeURIComponent(id)}/images/${encodeURIComponent(jobId)}/${imageIndex}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`Failed to remove image from album ${id}: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; album: Album | null };
  return data.album;
}
