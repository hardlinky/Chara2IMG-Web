# Phase 5: Outputs and Gallery Review - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers output review for completed jobs through a gallery-oriented experience, while preserving per-output job provenance. This phase covers how users browse, open, and inspect generated images and their job linkage. It does not add new generation capabilities.

</domain>

<decisions>
## Implementation Decisions

### Gallery Layout and Density

- Use a masonry-style gallery with variable tile width.
- Preserve original image aspect ratios in masonry items.
- Default density is balanced.
- Provide a session-only density control (no long-term persistence required).
- Tiles are image-only at a glance (no text metadata on tiles).
- Load the first screen quickly, then lazy-load on scroll.
- Use balanced spacing between tiles.
- On mobile, use adaptive columns: 1 column on smaller phones, 2 columns on larger phones.

### Job-to-Output Grouping Behavior

- Use a hybrid gallery flow: flat visual browsing with lightweight per-job separators.
- Order gallery content by newest jobs first.
- For multi-image jobs, default to collapsed representation with a representative image and output count badge.
- Representative image is the first generated image for that job.
- Use subtle metadata chips above the first output in each job cluster as separators.
- Expansion from collapsed job representation opens a dedicated job-output view with return to gallery.
- Keep the collapsed-card pattern consistent even for single-image jobs.
- Omit failed or empty-output jobs from the Outputs gallery.
- In dedicated job-output view, large output sets should paginate/lazy-load.
- Returning from dedicated job-output view restores exact prior gallery scroll position and state context.
- Browsing defaults to within the selected job, with optional jump to the next job.

### Provenance Visibility Design

- In gallery, show minimal provenance marker only (not full metadata).
- Gallery provenance marker shows Job ID only.
- Full provenance details include Job ID, completion time, and workflow filename.
- Completion time uses relative format.
- Dedicated job-output view shows provenance as a compact single-line header row above images.
- No explicit copy actions for provenance fields.
- Job ID remains plain selectable text so users can copy manually.
- Workflow provenance uses the imported workflow filename only (no internal workflow name field assumption).

### Output Review Interactions

- Clicking an output image opens a lightbox overlay over the gallery.
- In lightbox, support keyboard navigation, arrow controls, and touch swipe navigation.
- Zoom supports scroll/pinch smooth zoom with reset control.
- Lightbox opens images at fit-to-viewport by default.
- Lightbox exits via explicit close/back only.
- Lightbox next/previous navigation is scoped to the current job outputs by default.
- While zoomed, pan takes precedence; next/previous swipe applies at fit zoom.
- Lightbox controls/chrome auto-hide after inactivity and reappear on movement/tap.
- Preload full current job outputs for lightbox navigation.
- At first/last image in a job, navigation wraps around.

### Copilot's Discretion

- Large-image handling strategy in lightbox can be selected during implementation based on practical performance tradeoffs.

</decisions>

<specifics>
## Specific Ideas

- Example workflow-file provenance expectation: `Chara2IMG2IMG - API.json` should be treated as the workflow identifier displayed in provenance.

</specifics>

<deferred>
## Deferred Ideas

- None - discussion stayed within phase scope.

</deferred>

---

_Phase: 05-outputs-and-gallery-review_
_Context gathered: 2026-05-24_
