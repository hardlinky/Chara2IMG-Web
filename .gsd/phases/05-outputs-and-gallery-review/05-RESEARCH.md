# Phase 05: Outputs and Gallery Review - Research

**Researched:** 2026-05-24
**Domain:** React output gallery UX, lightbox interaction, provenance modeling, and performance-safe image browsing
**Confidence:** MEDIUM-HIGH

## Summary

This phase should be planned as a client-side gallery/read workflow built on top of existing recent-job persistence, not a new generation subsystem. The current codebase already stores terminal job responses in IndexedDB via `recentJobsStorage` and updates them through polling; this is enough to derive an outputs gallery if we normalize output extraction into a multi-image model and add missing provenance fields.

For locked decisions, the most reliable architecture is: multi-column masonry-style gallery for broad browser compatibility, lightweight per-job separators and collapsed job cards for cluster browsing, and a dedicated job-output detail route/state that preserves gallery context. For lightbox interactions (keyboard, touch swipe, zoom/pan, wrapping, preload), use PhotoSwipe with React integration rather than hand-rolling gesture/state logic.

The largest planning risk is provenance completeness: current `RecentJobProvenance` stores `templateFingerprint` and draft/submission input, but not workflow filename. Because Phase 5 requires showing imported workflow filename in provenance, this must be added at submission time and backfilled/handled for legacy records.

- Research scope covered: masonry behavior, lightbox interaction stack, lazy loading patterns, scroll restoration, current repository contracts/state
- Standard approach: browser-native masonry fallback + PhotoSwipe + IntersectionObserver + persistent view-state in memory/session
- Key recommendation: treat this phase as a data-model + browsing architecture phase first, UI polish second

**Primary recommendation:** Plan Phase 5 around a normalized `JobOutputAsset[]` projection from stored jobs, then layer gallery/dedicated view/lightbox behavior on top of that stable projection.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| React | 19.x (repo uses 19.0.0) | Gallery state, view transitions, lightbox host integration | Already in repo; sufficient for view-state and composition |
| PhotoSwipe | 5.4.4 | Lightbox: keyboard nav, swipe, zoom/pan, wrap, preload tuning | Mature lightbox behavior with built-in gesture/navigation options |
| react-photoswipe-gallery | 4.0.0 | React wrapper around PhotoSwipe | Reduces integration complexity and event wiring in React |
| Web Platform: CSS Multi-column + break-inside | Baseline (MDN) | Masonry-style layout with preserved aspect ratios and balanced spacing | Works broadly today; native CSS Grid masonry is still experimental |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| Dexie | 4.4.2 (repo uses 4.4.2) | Existing IndexedDB persistence for recent jobs/provenance | Continue using for output review data source; avoid new storage stack |
| IntersectionObserver API | Baseline widely available | Lazy loading/pagination trigger for gallery and dedicated view | Use for infinite scroll sentinel and prefetch windows |
| HTMLImageElement + img loading controls | Baseline widely available | Fast first screen load and smoother image decode | Use `loading`, `decoding`, width/height hints, and optional `decode()` preloading |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| CSS Multi-column masonry | Native CSS Grid masonry (`grid-lanes` / masonry values) | Grid masonry remains experimental and unsupported in major browsers; not safe as primary path |
| PhotoSwipe stack | Custom lightbox/gesture implementation | High complexity for pan-vs-swipe, zoom bounds, keyboard/accessibility, wrap behavior |
| Native CSS masonry | `react-responsive-masonry` 2.7.2 | Works, but adds dependency without solving core provenance/state complexity |

**Installation:**
```bash
npm install photoswipe react-photoswipe-gallery
```

## Architecture Patterns

### Recommended Project Structure

```text
src/client/features/outputs/
├── useOutputGallery.ts           # derive grouped gallery model from recent jobs
├── OutputGallery.tsx             # masonry gallery + separators + collapsed cards
├── JobOutputView.tsx             # dedicated job-output page/view state
├── OutputLightbox.tsx            # PhotoSwipe integration and options
└── outputGallery.types.ts        # UI-facing normalized types

src/client/lib/
├── jobOutputProjection.ts        # normalize RecentJobRecord -> JobOutputAsset[]
└── galleryViewState.ts           # scroll + density + expansion session state

src/shared/contracts/
└── jobs.ts                       # provenance additions (workflow filename, completion info)
```

### Pattern 1: Output Projection Layer (Required)

**What:** Create a deterministic projection function that maps stored jobs into gallery-ready groups and output assets.
**When to use:** Always. UI components should never parse raw Runpod response payloads directly.
**Example:**
```typescript
// Source: repository pattern derived from src/client/lib/runpodOutputImage.ts and RecentJobRecord usage
type JobOutputAsset = {
  jobId: string;
  outputIndex: number;
  src: string; // data URL or remote URL
  mimeType: string;
  width?: number;
  height?: number;
  isRepresentative: boolean;
};

function projectOutputs(job: RecentJobRecord): JobOutputAsset[] {
  // Parse all image-like values from terminal response (not just the first match).
  // Return [] for failed/non-output jobs so gallery omits them by contract.
}
```

### Pattern 2: Hybrid Gallery Clusters (Locked Decision Alignment)

**What:** Render a flattened scroll list with subtle per-job separator chips plus collapsed job card tiles.
**When to use:** Default gallery mode (newest-first), including single-image jobs.
**Example:**
```typescript
// Source: phase context decisions + existing newest-first sorting in useRecentJobs.ts
type GalleryCluster = {
  jobId: string;
  completedRelative: string;
  workflowFileName: string;
  representative: JobOutputAsset;
  outputCount: number;
};

// Sort clusters by completed/submitted timestamp descending.
// Show only representative image + count badge in gallery tiles.
```

### Pattern 3: Dedicated Job View With Restorable Context

**What:** Open a job-specific output view that can paginate/lazy-load large output sets and return to exact prior gallery state.
**When to use:** On cluster expansion and when browsing within a single job output set.
**Example:**
```typescript
// Source: MDN History.scrollRestoration + app local state patterns
type GalleryReturnState = {
  scrollY: number;
  density: "compact" | "balanced" | "comfortable";
  selectedJobId?: string;
};

// Save return state before transition.
// Restore scroll and density on back.
```

### Pattern 4: Lightbox Scoped to Job Outputs

**What:** Feed only current job outputs into lightbox data source; enable wrap and preloading for smooth in-job navigation.
**When to use:** Clicking any output tile in gallery or dedicated job view.
**Example:**
```typescript
// Source: https://photoswipe.com/options/
const lightboxOptions = {
  loop: true,
  arrowKeys: true,
  wheelToZoom: true,
  preload: [1, 4],
  allowPanToNext: false // ensures pan precedence while zoomed
};
```

### Anti-Patterns to Avoid

- **Parsing output payload inside components:** causes duplicate logic and inconsistent output counts.
- **Storing gallery-only state in durable storage:** density is session-only by decision.
- **Attempting native CSS Grid masonry as primary:** browser support is currently not production-safe.
- **Mixing cross-job and in-job lightbox navigation silently:** violates default scoped navigation decision.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Gesture-rich lightbox | Custom pinch/zoom/pan/swipe engine | PhotoSwipe + React wrapper | Complex interaction edge cases already solved |
| Infinite-scroll visibility checks | Scroll event math + repeated boundingClientRect polling | IntersectionObserver sentinel | Better performance and cleaner API |
| Scroll return behavior heuristics | Manual ad-hoc timeout-based scroll restoration | Explicit saved view-state + `history.scrollRestoration` strategy | Predictable exact context restoration |
| Masonry algorithm | Custom JS packing/reflow engine | CSS multicol + `break-inside: avoid` + responsive column rules | Satisfies locked design with less maintenance |

**Key insight:** The hard part in this phase is not rendering images; it is consistency across provenance, grouping semantics, and interaction state. Hand-rolling low-level UI infrastructure will consume time needed for correctness.

## Common Pitfalls

### Pitfall 1: Missing Workflow Filename Provenance

**What goes wrong:** Gallery/detail view cannot show required workflow filename because only template fingerprint is stored.
**Why it happens:** `RecentJobProvenance` currently lacks a workflow filename field.
**How to avoid:** Add workflow filename snapshot to job provenance at submission time, sourced from imported workflow metadata.
**Warning signs:** Placeholder labels like "Unknown workflow" appearing for newly submitted jobs.

### Pitfall 2: Single-Image Extraction in a Multi-Image Domain

**What goes wrong:** Multi-image jobs appear with incorrect count or missing outputs.
**Why it happens:** Existing extractor (`extractRunpodImagePreview`) stops at first match.
**How to avoid:** Introduce a full-output extractor that collects all valid image outputs with stable ordering.
**Warning signs:** Count badge mismatches and lightbox showing fewer images than expected.

### Pitfall 3: CLS and Janky First Screen

**What goes wrong:** Tiles jump during load, first paint feels slow.
**Why it happens:** Missing width/height hints and no eager priority for initial viewport images.
**How to avoid:** Set intrinsic dimensions where available, use `loading="lazy"` off-screen, and prioritize initial viewport representative images.
**Warning signs:** Layout shifts during initial scroll and delayed first tile paint.

### Pitfall 4: Wrong Swipe Behavior While Zoomed

**What goes wrong:** Users trying to pan a zoomed image accidentally change slides.
**Why it happens:** Default navigation behavior not configured for pan precedence.
**How to avoid:** Configure lightbox options so pan dominates while zoomed and swipe navigation applies at fit zoom.
**Warning signs:** Frequent accidental slide changes during zoom interaction.

### Pitfall 5: Losing Return Context

**What goes wrong:** Back from dedicated view drops user at top of gallery or resets density.
**Why it happens:** Return state not captured/restored atomically.
**How to avoid:** Snapshot scroll + density + selected job before transition, restore after remount.
**Warning signs:** Inconsistent back behavior across browser refresh/back button paths.

## Code Examples

Verified patterns from official sources:

### Lazy-load trigger with IntersectionObserver

```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        loadNextPage();
      }
    }
  },
  { root: null, rootMargin: "300px 0px", threshold: 0 }
);

observer.observe(sentinelElement);
```

### Masonry-style multicol container

```css
/* Source: MDN multicol + break-inside references */
.gallery {
  column-gap: 12px;
  column-width: 240px;
}

.galleryItem {
  break-inside: avoid;
  margin-bottom: 12px;
}
```

### Lightbox config for locked navigation semantics

```typescript
// Source: https://photoswipe.com/options/
const options = {
  loop: true,
  arrowKeys: true,
  wheelToZoom: true,
  allowPanToNext: false,
  preload: [1, 4]
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Native CSS grid masonry assumptions | CSS Grid masonry remains experimental; production uses alternatives | Ongoing; MDN compatibility current as of 2026-03 | Use multicol/library fallback for predictable cross-browser behavior |
| Custom lightbox scripts | Modular, dynamic-import lightbox packages | Modern SPA best practice (current PhotoSwipe v5 docs) | Better gesture/accessibility behavior with less bespoke code |
| Eager image loading in galleries | Browser-level lazy loading + observer-based pagination | Widely standardized by modern browser support | Faster first screen and lower memory/network pressure |

**Deprecated/outdated:**

- Native CSS Grid masonry as primary strategy: still experimental with broad no-support.
- Hand-rolled touch/zoom logic for production gallery UX: high maintenance and fragile behavior parity.

## Open Questions

1. **Runpod output schema variability for multi-image jobs**
   - What we know: current extractor finds nested base64/data URL images; status responses are persisted.
   - What's unclear: all output field shapes expected in real workloads (URLs, arrays, nested keys, mixed media).
   - Recommendation: create fixtures from real completed job payloads before finalizing extractor contract.

2. **Large-image strategy in lightbox (Copilot discretion area)**
   - What we know: PhotoSwipe has preload and deep-zoom plugin options.
   - What's unclear: memory/perf breakpoints for your typical image dimensions and mobile devices.
   - Recommendation: begin with standard PhotoSwipe preload; add deep-zoom path only if profiling shows memory pressure.

## Sources

### Primary (HIGH confidence)

- Repository inspection:
  - `src/client/lib/runpodOutputImage.ts`
  - `src/client/lib/recentJobsStorage.ts`
  - `src/shared/contracts/jobs.ts`
  - `src/shared/contracts/workflow.ts`
  - `src/shared/workflow/importWorkflow.ts`
- PhotoSwipe official docs:
  - https://photoswipe.com/
  - https://photoswipe.com/options/
  - https://photoswipe.com/react-image-gallery/
- MDN official docs:
  - https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
  - https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Lazy_loading
  - https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img
  - https://developer.mozilla.org/en-US/docs/Web/API/History/scrollRestoration
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/break-inside
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Masonry_layout

### Secondary (MEDIUM confidence)

- npm registry version checks (2026-05-24):
  - photoswipe 5.4.4
  - react-photoswipe-gallery 4.0.0
  - react-responsive-masonry 2.7.2
  - masonic 4.1.0

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - validated against official docs and current npm versions
- Architecture: MEDIUM-HIGH - grounded in locked decisions plus current repo patterns
- Pitfalls: MEDIUM-HIGH - directly observed from current contracts and existing extraction/storage behavior

**Research date:** 2026-05-24
**Valid until:** 2026-06-23 (30 days)