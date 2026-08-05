import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { Item } from "react-photoswipe-gallery";
import type { RecentJobOutputCluster } from "../../../shared/contracts/jobs";
import { formatOutputJobId } from "./formatOutputJobId";
import { FToggleGallery, type GalleryApi } from "./GalleryFToggle";
import { JobOutputsView } from "./JobOutputsView";
import { OutputImageCard } from "./OutputImageCard";
import { confirmDeletion } from "../../lib/confirmDelete";
import { OUTPUT_DENSITIES, type OutputDensity, useOutputGallery } from "./useOutputGallery";
import { getRoute, navigate, useRoute } from "../../lib/appRouter";
import { buildAlbumStarProps, type AlbumStarContext } from "../albums/albumStar";
import "./outputsGallery.css";
import "../../styles/jobsOutput.css";

type OutputsGalleryMode = "per-job" | "all-images";
type OutputsPinFilter = "all" | "pinned" | "unpinned";
const MOBILE_OUTPUT_DENSITIES: readonly OutputDensity[] = ["compact", "comfortable"];
const GALLERY_PAGE_SIZE = 12;
const OUTPUTS_PIN_FILTER_STORAGE_KEY = "chara2imgOutputsPinFilter";
const OUTPUTS_VIEW_MODE_STORAGE_KEY = "chara2imgOutputsViewMode";

function getStoredOutputsPinFilter(): OutputsPinFilter {
  if (typeof window === "undefined") {
    return "all";
  }

  const stored = window.localStorage.getItem(OUTPUTS_PIN_FILTER_STORAGE_KEY);
  return stored === "all" || stored === "pinned" || stored === "unpinned" ? stored : "all";
}

function getStoredOutputsViewMode(): OutputsGalleryMode {
  if (typeof window === "undefined") {
    return "per-job";
  }

  const stored = window.localStorage.getItem(OUTPUTS_VIEW_MODE_STORAGE_KEY);
  return stored === "per-job" || stored === "all-images" ? stored : "per-job";
}

type OutputsTabProps = {
  active?: boolean;
  clusters: RecentJobOutputCluster[];
  onRerun: (jobId: string) => void;
  onLoadInputs: (jobId: string) => void;
  onRemoveJobOutputs: (jobId: string) => void;
  onRemoveOutputImage: (jobId: string, outputIndex: number) => void;
  onExportWorkflow?: (jobId: string) => void;
  onToggleOutputPinned?: (jobId: string, outputIndex: number, pinned: boolean) => void;
  canPinMore?: boolean;
  onLoadOutputCluster?: (jobId: string) => Promise<RecentJobOutputCluster | null>;
  pinningImageKeys?: Set<string>;
  img2imgInputAvailable?: boolean;
  onLoadImageIntoImg2Img?: (imageUrl: string) => void;
  albumStarContext?: AlbumStarContext;
};

function getGalleryClassName(density: (typeof OUTPUT_DENSITIES)[number]): string {
  return `outputs-gallery outputs-gallery-${density}`;
}

export function resolveSelectedJobCluster(
  selectedJobId: string | null,
  clusters: RecentJobOutputCluster[],
  hydratedJobClusters: Record<string, RecentJobOutputCluster>,
  gallerySelectedCluster: RecentJobOutputCluster | null
): RecentJobOutputCluster | null {
  if (!selectedJobId) {
    return gallerySelectedCluster;
  }

  const liveCluster = clusters.find((cluster) => cluster.jobId === selectedJobId) ?? null;
  if (liveCluster) {
    return liveCluster;
  }

  return hydratedJobClusters[selectedJobId] ?? gallerySelectedCluster;
}

export function OutputsTab({ active = true, clusters, onRerun, onLoadInputs, onRemoveJobOutputs, onRemoveOutputImage, onExportWorkflow, onToggleOutputPinned, canPinMore = true, onLoadOutputCluster, pinningImageKeys, img2imgInputAvailable = false, onLoadImageIntoImg2Img, albumStarContext }: OutputsTabProps) {
  const gallery = useOutputGallery(clusters);
  const route = useRoute();
  const galleryApiRef = useRef<GalleryApi | null>(null);
  const [galleryMode, setGalleryMode] = useState<OutputsGalleryMode>(() => getStoredOutputsViewMode());
  const [pinFilter, setPinFilter] = useState<OutputsPinFilter>(() => getStoredOutputsPinFilter());
  const [galleryPage, setGalleryPage] = useState(1);
  const [hydratedJobClusters, setHydratedJobClusters] = useState<Record<string, RecentJobOutputCluster>>({});
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(max-width: 600px)").matches : false));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 600px)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);

    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  const availableDensities = useMemo<readonly OutputDensity[]>(() => (isMobile ? MOBILE_OUTPUT_DENSITIES : OUTPUT_DENSITIES), [isMobile]);

  useEffect(() => {
    if (!availableDensities.includes(gallery.density)) {
      gallery.setDensity(availableDensities[0] ?? "comfortable");
    }
  }, [availableDensities, gallery]);

  const pinnedImageCount = useMemo(
    () => clusters.reduce((count, cluster) => count + cluster.outputs.filter((output) => output.isPinned).length, 0),
    [clusters]
  );

  const filteredClusters = useMemo(() => {
    return clusters
      .map((cluster) => {
        const filteredOutputs = cluster.outputs.filter((output) => {
          if (pinFilter === "pinned") {
            return output.isPinned;
          }

          if (pinFilter === "unpinned") {
            return !output.isPinned;
          }

          return true;
        });

        if (filteredOutputs.length === 0) {
          return null;
        }

        return {
          ...cluster,
          outputCount: filteredOutputs.length,
          representative: filteredOutputs[0]!,
          outputs: filteredOutputs
        };
      })
      .filter((cluster): cluster is RecentJobOutputCluster => Boolean(cluster));
  }, [clusters, pinFilter]);

  const allOutputImages = useMemo(
    () =>
      filteredClusters.flatMap((cluster) =>
        cluster.outputs.map((output) => ({
          ...output,
          jobId: cluster.jobId
        }))
      ),
    [filteredClusters]
  );

  const pageItemCount = galleryMode === "per-job" ? filteredClusters.length : allOutputImages.length;
  const galleryPageCount = Math.max(1, Math.ceil(pageItemCount / GALLERY_PAGE_SIZE));

  useEffect(() => {
    if (galleryPage > galleryPageCount) {
      setGalleryPage(galleryPageCount);
    }
  }, [galleryPage, galleryPageCount]);

  const pageStart = (galleryPage - 1) * GALLERY_PAGE_SIZE;
  const pageEnd = pageStart + GALLERY_PAGE_SIZE;
  const pagedClusters = useMemo(() => filteredClusters.slice(pageStart, pageEnd), [filteredClusters, pageEnd, pageStart]);
  const pagedAllOutputImages = useMemo(() => allOutputImages.slice(pageStart, pageEnd), [allOutputImages, pageEnd, pageStart]);

  const selectedJobId = gallery.view.mode === "job" ? gallery.view.jobId : null;
  const selectedJobCluster = resolveSelectedJobCluster(selectedJobId, clusters, hydratedJobClusters, gallery.selectedCluster);

  useEffect(() => {
    setGalleryPage(1);
  }, [galleryMode, pinFilter]);

  const getImageDimensionKey = (jobId: string, outputIndex: number): string => `${jobId}:${outputIndex}`;

  const handleImageLoad = (jobId: string, outputIndex: number, event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      return;
    }

    const key = getImageDimensionKey(jobId, outputIndex);
    setImageDimensions((current) => {
      const existing = current[key];
      if (existing && existing.width === naturalWidth && existing.height === naturalHeight) {
        return current;
      }

      return {
        ...current,
        [key]: { width: naturalWidth, height: naturalHeight }
      };
    });
  };

  useEffect(() => {
    if (!onLoadOutputCluster || !selectedJobId || hydratedJobClusters[selectedJobId]) {
      return;
    }

    void onLoadOutputCluster(selectedJobId).then((cluster) => {
      if (!cluster) {
        return;
      }

      setHydratedJobClusters((current) => ({
        ...current,
        [selectedJobId]: cluster
      }));
    });
  }, [hydratedJobClusters, onLoadOutputCluster, selectedJobId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(OUTPUTS_PIN_FILTER_STORAGE_KEY, pinFilter);
  }, [pinFilter]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(OUTPUTS_VIEW_MODE_STORAGE_KEY, galleryMode);
  }, [galleryMode]);

  // Sync the open job with the URL `job` param. Only the active tab owns it.
  // Reader reacts solely to URL changes (deep links, back/forward, cross-tab);
  // writer reflects view changes into the URL. Keeping the reader off view
  // changes avoids a lag-window feedback loop between the two effects.
  const galleryViewRef = useRef(gallery.view);
  galleryViewRef.current = gallery.view;

  useEffect(() => {
    if (!active) {
      return;
    }

    const viewJobId = galleryViewRef.current.mode === "job" ? galleryViewRef.current.jobId : null;
    if (route.jobId && route.jobId !== viewJobId) {
      gallery.openJobOutputs(route.jobId);
    } else if (!route.jobId && viewJobId) {
      gallery.goBackToGallery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, route.jobId]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const viewJobId = gallery.view.mode === "job" ? gallery.view.jobId : null;
    if (getRoute().jobId !== viewJobId) {
      navigate({ jobId: viewJobId }, "push");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, gallery.view]);

  if (gallery.view.mode === "job" && selectedJobCluster) {
    return (
      <JobOutputsView
        cluster={selectedJobCluster}
        density={gallery.density}
        onBack={gallery.goBackToGallery}
        onPreviousJob={gallery.selectedClusterIndex > 0 ? gallery.goToPreviousJob : undefined}
        onNextJob={gallery.selectedClusterIndex >= 0 && gallery.selectedClusterIndex + 1 < clusters.length ? gallery.goToNextJob : undefined}
        onRerun={() => onRerun(selectedJobCluster.jobId)}
        onLoadInputs={() => onLoadInputs(selectedJobCluster.jobId)}
        onRemoveImage={(outputIndex) => onRemoveOutputImage(selectedJobCluster.jobId, outputIndex)}
        onRemoveAllOutputs={() => {
          onRemoveJobOutputs(selectedJobCluster.jobId);
          gallery.goBackToGallery();
        }}
        onExportWorkflow={onExportWorkflow ? () => onExportWorkflow(selectedJobCluster.jobId) : undefined}
        onTogglePinnedImage={onToggleOutputPinned ? (outputIndex, pinned) => onToggleOutputPinned(selectedJobCluster.jobId, outputIndex, pinned) : undefined}
        canPinMore={canPinMore}
        pinningOutputIndices={pinningImageKeys ? new Set([...pinningImageKeys].filter((k) => k.startsWith(`${selectedJobCluster.jobId}:`)).map((k) => Number(k.split(":")[1]))) : undefined}
        img2imgInputAvailable={img2imgInputAvailable}
        onLoadImageIntoImg2Img={onLoadImageIntoImg2Img}
        albumStarContext={albumStarContext}
      />
    );
  }

  const paginationControls =
    pageItemCount > 0 ? (
      <div className="jobs-pagination">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setGalleryPage((current) => Math.max(1, current - 1))}
          disabled={galleryPage <= 1}
        >
          Prev page
        </button>
        <span className="jobs-pagination-page">
          Page
          <input
            className="input jobs-pagination-input"
            type="number"
            min={1}
            max={galleryPageCount}
            value={galleryPage}
            style={{ "--page-digits": String(galleryPageCount).length } as React.CSSProperties}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                setGalleryPage(Math.max(1, Math.min(galleryPageCount, Math.trunc(next))));
              }
            }}
            aria-label="Go to page"
          />
          <span className="jobs-pagination-total">/ {galleryPageCount}</span>
        </span>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setGalleryPage((current) => Math.min(galleryPageCount, current + 1))}
          disabled={galleryPage >= galleryPageCount}
        >
          Next page
        </button>
      </div>
    ) : null;

  return (
    <section className="outputs-panel">
      <header className="outputs-toolbar">
        <h2>Outputs</h2>
        <span className="outputs-pin-counter">Pins: {pinnedImageCount}</span>
        <div className="outputs-toolbar-controls">
          <label className="field outputs-view-toggle-field">
            View
            <button
              className="btn btn-secondary outputs-view-toggle-btn"
              type="button"
              onClick={() => setGalleryMode((current) => (current === "per-job" ? "all-images" : "per-job"))}
            >
              {galleryMode === "per-job" ? "Jobs" : "Images"}
            </button>
          </label>
          <label className="field">
            Filter
            <select className="select" value={pinFilter} onChange={(event) => setPinFilter(event.target.value as OutputsPinFilter)}>
              <option value="all">All images</option>
              <option value="pinned">Pinned only</option>
              <option value="unpinned">Unpinned only</option>
            </select>
          </label>
          <label className="field">
            Density
            <select className="select" value={gallery.density} onChange={(event) => gallery.setDensity(event.target.value as OutputDensity)}>
              {availableDensities.map((density) => (
                <option key={density} value={density}>
                  {density[0]?.toUpperCase()}
                  {density.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {clusters.length === 0 ? <p>No completed job outputs yet.</p> : null}
      {clusters.length > 0 && filteredClusters.length === 0 ? <p>No outputs match the selected pin filter.</p> : null}

      {paginationControls}

      {galleryMode === "per-job" ? (
        <FToggleGallery
          apiRef={galleryApiRef}
          itemCount={pagedClusters.length}
          onTogglePinCurrent={
            onToggleOutputPinned
              ? (index) => {
                  const cluster = pagedClusters[index];
                  if (cluster) {
                    onToggleOutputPinned(cluster.jobId, cluster.representative.outputIndex, !cluster.representative.isPinned);
                  }
                }
              : undefined
          }
          onDeleteCurrent={(index) => {
            const cluster = pagedClusters[index];
            if (cluster) {
              void confirmDeletion({ message: "Delete this image? This can't be undone.", confirmLabel: "Delete" }).then((ok) => {
                if (ok) onRemoveOutputImage(cluster.jobId, cluster.representative.outputIndex);
              });
            }
          }}
          onViewJobCurrent={(index) => {
            const cluster = pagedClusters[index];
            if (cluster) {
              gallery.openJobOutputs(cluster.jobId);
            }
          }}
          onLoadImg2ImgCurrent={
            img2imgInputAvailable && onLoadImageIntoImg2Img
              ? (index) => {
                  const cluster = pagedClusters[index];
                  if (cluster) {
                    onLoadImageIntoImg2Img(cluster.representative.dataUrl);
                    galleryApiRef.current?.close();
                  }
                }
              : undefined
          }
          options={{
            loop: true,
            allowPanToNext: false,
            preload: [1, 2],
            escKey: true,
            arrowKeys: true,
            pinchToClose: true,
            bgOpacity: 0.92,
            showHideAnimationType: "zoom",
            wheelToZoom: true
          }}
        >
          <div className={getGalleryClassName(gallery.density)}>
            {pagedClusters.map((cluster) => (
              (() => {
                const dimensionKey = getImageDimensionKey(cluster.jobId, cluster.representative.outputIndex);
                const dimensions = imageDimensions[dimensionKey] ?? { width: 1024, height: 1024 };
                const displayJobId = formatOutputJobId(cluster.jobId);

                const aspectRatio = dimensions.width / dimensions.height;

                return (
              <article 
                key={cluster.jobId} 
                className="outputs-cluster-card"
                style={{ "--image-aspect": aspectRatio } as React.CSSProperties}
              >
                <Item
                  original={cluster.representative.dataUrl}
                  thumbnail={cluster.representative.dataUrl}
                  width={String(dimensions.width)}
                  height={String(dimensions.height)}
                  caption={`${cluster.jobId} #1`}
                >
                  {({ ref, open }) => (
                    <div ref={ref as never}>
                      <OutputImageCard
                        image={cluster.representative}
                        imagePrefix={cluster.jobId}
                        displayPrefix={displayJobId}
                        imageLabel="1"
                        onOpen={open}
                        onImageLoad={(event) => handleImageLoad(cluster.jobId, cluster.representative.outputIndex, event)}
                        onViewJobOutputs={() => gallery.openJobOutputs(cluster.jobId)}
                        onRemoveImage={onRemoveOutputImage ? () => onRemoveOutputImage(cluster.jobId, cluster.representative.outputIndex) : undefined}
                        onTogglePin={onToggleOutputPinned ? () => onToggleOutputPinned(cluster.jobId, cluster.representative.outputIndex, !cluster.representative.isPinned) : undefined}
                        canPinMore={canPinMore}
                        isPinning={pinningImageKeys?.has(`${cluster.jobId}:${cluster.representative.outputIndex}`) ?? false}
                        badge={`${cluster.outputCount} images`}
                        albumStar={buildAlbumStarProps(albumStarContext, cluster.jobId, cluster.representative.outputIndex)}
                      />
                    </div>
                  )}
                </Item>
              </article>
                );
              })()
            ))}
          </div>
        </FToggleGallery>
      ) : (
        <FToggleGallery
          apiRef={galleryApiRef}
          itemCount={pagedAllOutputImages.length}
          onTogglePinCurrent={
            onToggleOutputPinned
              ? (index) => {
                  const outputImage = pagedAllOutputImages[index];
                  if (outputImage) {
                    onToggleOutputPinned(outputImage.jobId, outputImage.outputIndex, !outputImage.isPinned);
                  }
                }
              : undefined
          }
          onDeleteCurrent={(index) => {
            const outputImage = pagedAllOutputImages[index];
            if (outputImage) {
              void confirmDeletion({ message: "Delete this image? This can't be undone.", confirmLabel: "Delete" }).then((ok) => {
                if (ok) onRemoveOutputImage(outputImage.jobId, outputImage.outputIndex);
              });
            }
          }}
          onViewJobCurrent={(index) => {
            const outputImage = pagedAllOutputImages[index];
            if (outputImage) {
              gallery.openJobOutputs(outputImage.jobId);
            }
          }}
          onLoadImg2ImgCurrent={
            img2imgInputAvailable && onLoadImageIntoImg2Img
              ? (index) => {
                  const outputImage = pagedAllOutputImages[index];
                  if (outputImage) {
                    onLoadImageIntoImg2Img(outputImage.dataUrl);
                    galleryApiRef.current?.close();
                  }
                }
              : undefined
          }
          options={{
            loop: true,
            allowPanToNext: false,
            preload: [1, 2],
            escKey: true,
            arrowKeys: true,
            pinchToClose: true,
            bgOpacity: 0.92,
            showHideAnimationType: "zoom",
            wheelToZoom: true
          }}
        >
          <div className={getGalleryClassName(gallery.density)}>
            {pagedAllOutputImages.map((outputImage) => (
              (() => {
                const dimensionKey = getImageDimensionKey(outputImage.jobId, outputImage.outputIndex);
                const dimensions = imageDimensions[dimensionKey] ?? { width: 1024, height: 1024 };
                const displayJobId = formatOutputJobId(outputImage.jobId);

                const aspectRatio = dimensions.width / dimensions.height;

                return (
              <article 
                key={`${outputImage.jobId}-${outputImage.outputIndex}`} 
                className="outputs-cluster-card"
                style={{ "--image-aspect": aspectRatio } as React.CSSProperties}
              >
                <Item
                  original={outputImage.dataUrl}
                  thumbnail={outputImage.dataUrl}
                  width={String(dimensions.width)}
                  height={String(dimensions.height)}
                  caption={`${outputImage.jobId} #${outputImage.outputIndex + 1}`}
                >
                  {({ ref, open }) => (
                    <div ref={ref as never}>
                      <OutputImageCard
                        image={outputImage}
                        imagePrefix={outputImage.jobId}
                        displayPrefix={displayJobId}
                        imageLabel={`${outputImage.outputIndex + 1}`}
                        onOpen={open}
                        onImageLoad={(event) => handleImageLoad(outputImage.jobId, outputImage.outputIndex, event)}
                        onViewJobOutputs={() => gallery.openJobOutputs(outputImage.jobId)}
                        onRemoveImage={onRemoveOutputImage ? () => onRemoveOutputImage(outputImage.jobId, outputImage.outputIndex) : undefined}
                        onTogglePin={onToggleOutputPinned ? () => onToggleOutputPinned(outputImage.jobId, outputImage.outputIndex, !outputImage.isPinned) : undefined}
                        canPinMore={canPinMore}
                        isPinning={pinningImageKeys?.has(`${outputImage.jobId}:${outputImage.outputIndex}`) ?? false}
                        albumStar={buildAlbumStarProps(albumStarContext, outputImage.jobId, outputImage.outputIndex)}
                      />
                    </div>
                  )}
                </Item>
              </article>
                );
              })()
            ))}
          </div>
        </FToggleGallery>
      )}

      {paginationControls}
    </section>
  );
}
