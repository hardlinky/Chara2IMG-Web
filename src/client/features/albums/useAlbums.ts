import { useCallback, useEffect, useRef, useState } from "react";
import type { Album } from "../../../shared/contracts/albums";
import * as albumsClient from "../../lib/api/albumsClient";

type UseAlbumsResult = {
  albums: Album[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createAlbum: (input: { name: string; description?: string; jobId: string; imageIndex: number }) => Promise<Album>;
  updateAlbum: (id: string, updates: { name?: string; description?: string }) => Promise<Album>;
  deleteAlbum: (id: string) => Promise<void>;
  addImageToAlbum: (id: string, jobId: string, imageIndex: number) => Promise<Album>;
  removeImageFromAlbum: (id: string, jobId: string, imageIndex: number) => Promise<Album | null>;
};

function upsertAlbum(albums: Album[], album: Album): Album[] {
  const index = albums.findIndex((existing) => existing.id === album.id);
  if (index === -1) {
    return [album, ...albums];
  }
  const next = [...albums];
  next[index] = album;
  return next;
}

export function useAlbums(active: boolean): UseAlbumsResult {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await albumsClient.listAlbums();
      setAlbums(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load albums");
    } finally {
      setIsLoading(false);
      hasLoadedRef.current = true;
    }
  }, []);

  // Load once on first mount, then again whenever the tab becomes active so
  // server-side dead-ref pruning is reflected without a manual reload.
  useEffect(() => {
    if (!hasLoadedRef.current || active) {
      void refresh();
    }
  }, [active, refresh]);

  const createAlbum = useCallback<UseAlbumsResult["createAlbum"]>(async (input) => {
    const album = await albumsClient.createAlbum(input);
    setAlbums((prev) => upsertAlbum(prev, album));
    return album;
  }, []);

  const updateAlbum = useCallback<UseAlbumsResult["updateAlbum"]>(async (id, updates) => {
    const album = await albumsClient.updateAlbum(id, updates);
    setAlbums((prev) => upsertAlbum(prev, album));
    return album;
  }, []);

  const deleteAlbum = useCallback<UseAlbumsResult["deleteAlbum"]>(async (id) => {
    await albumsClient.deleteAlbum(id);
    setAlbums((prev) => prev.filter((album) => album.id !== id));
  }, []);

  const addImageToAlbum = useCallback<UseAlbumsResult["addImageToAlbum"]>(async (id, jobId, imageIndex) => {
    const album = await albumsClient.addImageToAlbum(id, jobId, imageIndex);
    setAlbums((prev) => upsertAlbum(prev, album));
    return album;
  }, []);

  const removeImageFromAlbum = useCallback<UseAlbumsResult["removeImageFromAlbum"]>(
    async (id, jobId, imageIndex) => {
      const album = await albumsClient.removeImageFromAlbum(id, jobId, imageIndex);
      setAlbums((prev) => (album ? upsertAlbum(prev, album) : prev.filter((existing) => existing.id !== id)));
      return album;
    },
    []
  );

  return {
    albums,
    isLoading,
    error,
    refresh,
    createAlbum,
    updateAlbum,
    deleteAlbum,
    addImageToAlbum,
    removeImageFromAlbum
  };
}
