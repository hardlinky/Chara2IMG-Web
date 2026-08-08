import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Album, AlbumImageRef } from "../../shared/contracts/albums.js";
import { getJobArchiveDir, listPresentImageIndices, readJobAnywhere } from "./jobStore.js";

function albumsFilePath(): string {
  return join(getJobArchiveDir(), "albums.json");
}

let writeChain: Promise<unknown> = Promise.resolve();

// Serialize reads/writes so concurrent requests never clobber albums.json.
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readAlbumsFile(): Promise<Album[]> {
  try {
    const raw = await readFile(albumsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as { albums?: Album[] };
    if (!Array.isArray(parsed.albums)) {
      return [];
    }
    // Normalize legacy records that predate createdBy/isPublished.
    return parsed.albums.map((album) => ({
      ...album,
      createdBy: album.createdBy ?? null,
      isPublished: Boolean(album.isPublished)
    }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeAlbumsFile(albums: Album[]): Promise<void> {
  await mkdir(getJobArchiveDir(), { recursive: true });
  await writeFile(albumsFilePath(), JSON.stringify({ albums }, null, 2), "utf8");
}

// Drop image refs whose files no longer exist, then drop albums left empty.
export function filterAlbumsAgainstPresence(
  albums: Album[],
  presentByJob: Map<string, Set<number>>
): { albums: Album[]; changed: boolean } {
  let changed = false;
  const next: Album[] = [];
  for (const album of albums) {
    const keptImages = album.images.filter(
      (ref) => presentByJob.get(ref.jobId)?.has(ref.imageIndex) ?? false
    );
    if (keptImages.length !== album.images.length) {
      changed = true;
    }
    if (keptImages.length === 0) {
      changed = true;
      continue;
    }
    next.push(keptImages.length === album.images.length ? album : { ...album, images: keptImages });
  }
  return { albums: next, changed };
}

async function buildJobImageState(
  albums: Album[]
): Promise<{ present: Map<string, Set<number>>; pinned: Map<string, Set<number>> }> {
  const jobIds = new Set<string>();
  for (const album of albums) {
    for (const ref of album.images) {
      jobIds.add(ref.jobId);
    }
  }
  const present = new Map<string, Set<number>>();
  const pinned = new Map<string, Set<number>>();
  await Promise.all(
    Array.from(jobIds).map(async (jobId) => {
      const job = await readJobAnywhere(jobId);
      if (!job) {
        present.set(jobId, new Set());
        pinned.set(jobId, new Set());
        return;
      }
      const indices = await listPresentImageIndices(jobId, job.displayName);
      present.set(jobId, new Set(indices));
      pinned.set(jobId, new Set(job.pinnedImageIndices ?? []));
    })
  );
  return { present, pinned };
}

// Read albums, prune dead refs + emptied albums, persist if anything changed.
async function loadPrunedAlbums(): Promise<{ albums: Album[]; pinned: Map<string, Set<number>> }> {
  const albums = await readAlbumsFile();
  if (albums.length === 0) {
    return { albums: [], pinned: new Map() };
  }
  const { present, pinned } = await buildJobImageState(albums);
  const { albums: pruned, changed } = filterAlbumsAgainstPresence(albums, present);
  if (changed) {
    await writeAlbumsFile(pruned);
  }
  return { albums: pruned, pinned };
}

function sortImagesNewestFirst(images: AlbumImageRef[]): AlbumImageRef[] {
  return [...images].sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
}

function sortAlbumsNewestFirst(albums: Album[]): Album[] {
  return [...albums].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// An album is visible to a user if they own it, it's anonymous, or it's published.
function isAlbumVisibleTo(album: Album, user: string | null): boolean {
  return album.createdBy === null || album.createdBy === user || album.isPublished;
}

// A user may manage (edit/delete/publish) their own albums and anonymous ones.
export function canManageAlbum(album: Album, user: string | null): boolean {
  return album.createdBy === null || album.createdBy === user;
}

export async function listAlbums(user: string | null): Promise<Album[]> {
  return withLock(async () => {
    const { albums, pinned } = await loadPrunedAlbums();
    return sortAlbumsNewestFirst(albums)
      .filter((album) => isAlbumVisibleTo(album, user))
      .map((album) => ({
        ...album,
        images: sortImagesNewestFirst(album.images).map((ref) => ({
          ...ref,
          isPinned: pinned.get(ref.jobId)?.has(ref.imageIndex) ?? false
        }))
      }));
  });
}

export async function getAlbum(id: string, user: string | null): Promise<Album | null> {
  const albums = await listAlbums(user);
  return albums.find((album) => album.id === id) ?? null;
}

// True when the image belongs to an album visible to the requesting user.
export async function isImageInVisibleAlbum(
  jobId: string,
  imageIndex: number,
  user: string | null
): Promise<boolean> {
  const albums = await readAlbumsFile();
  return albums.some(
    (album) =>
      isAlbumVisibleTo(album, user) &&
      album.images.some((ref) => ref.jobId === jobId && ref.imageIndex === imageIndex)
  );
}

export async function createAlbum(input: {
  name: string;
  description?: string;
  jobId: string;
  imageIndex: number;
  createdBy: string | null;
}): Promise<Album> {
  return withLock(async () => {
    const albums = await readAlbumsFile();
    const now = new Date().toISOString();
    const album: Album = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? "",
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      isPublished: false,
      images: [{ jobId: input.jobId, imageIndex: input.imageIndex, addedAt: now }]
    };
    await writeAlbumsFile([album, ...albums]);
    return album;
  });
}

export async function updateAlbum(
  id: string,
  updates: { name?: string; description?: string; isPublished?: boolean }
): Promise<Album | null> {
  return withLock(async () => {
    const albums = await readAlbumsFile();
    const index = albums.findIndex((album) => album.id === id);
    if (index === -1) {
      return null;
    }
    const existing = albums[index]!;
    const next: Album = {
      ...existing,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      isPublished: updates.isPublished ?? existing.isPublished,
      updatedAt: new Date().toISOString()
    };
    const nextAlbums = [...albums];
    nextAlbums[index] = next;
    await writeAlbumsFile(nextAlbums);
    return next;
  });
}

export async function deleteAlbum(id: string): Promise<boolean> {
  return withLock(async () => {
    const albums = await readAlbumsFile();
    const nextAlbums = albums.filter((album) => album.id !== id);
    if (nextAlbums.length === albums.length) {
      return false;
    }
    await writeAlbumsFile(nextAlbums);
    return true;
  });
}

export async function addImageToAlbum(
  id: string,
  jobId: string,
  imageIndex: number
): Promise<Album | null> {
  return withLock(async () => {
    const albums = await readAlbumsFile();
    const index = albums.findIndex((album) => album.id === id);
    if (index === -1) {
      return null;
    }
    const existing = albums[index]!;
    const already = existing.images.some(
      (ref) => ref.jobId === jobId && ref.imageIndex === imageIndex
    );
    if (already) {
      return existing;
    }
    const now = new Date().toISOString();
    const next: Album = {
      ...existing,
      images: [{ jobId, imageIndex, addedAt: now }, ...existing.images],
      updatedAt: now
    };
    const nextAlbums = [...albums];
    nextAlbums[index] = next;
    await writeAlbumsFile(nextAlbums);
    return next;
  });
}

// Returns the updated album, or null if the album was not found OR became empty
// and was removed as a result.
export async function removeImageFromAlbum(
  id: string,
  jobId: string,
  imageIndex: number
): Promise<Album | null> {
  return withLock(async () => {
    const albums = await readAlbumsFile();
    const index = albums.findIndex((album) => album.id === id);
    if (index === -1) {
      return null;
    }
    const existing = albums[index]!;
    const keptImages = existing.images.filter(
      (ref) => !(ref.jobId === jobId && ref.imageIndex === imageIndex)
    );
    if (keptImages.length === 0) {
      await writeAlbumsFile(albums.filter((album) => album.id !== id));
      return null;
    }
    const next: Album = { ...existing, images: keptImages, updatedAt: new Date().toISOString() };
    const nextAlbums = [...albums];
    nextAlbums[index] = next;
    await writeAlbumsFile(nextAlbums);
    return next;
  });
}

// Cascade when an output image is deleted elsewhere: strip its ref from every
// album and drop any album left empty.
export async function removeImageFromAllAlbums(
  jobId: string,
  imageIndex: number
): Promise<void> {
  await withLock(async () => {
    const albums = await readAlbumsFile();
    let changed = false;
    const now = new Date().toISOString();
    const next: Album[] = [];
    for (const album of albums) {
      const keptImages = album.images.filter(
        (ref) => !(ref.jobId === jobId && ref.imageIndex === imageIndex)
      );
      if (keptImages.length !== album.images.length) {
        changed = true;
      }
      if (keptImages.length === 0) {
        changed = true;
        continue;
      }
      next.push(
        keptImages.length === album.images.length
          ? album
          : { ...album, images: keptImages, updatedAt: now }
      );
    }
    if (changed) {
      await writeAlbumsFile(next);
    }
  });
}
