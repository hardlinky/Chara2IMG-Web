# Phase 6: UI Refresh and Interaction Foundation - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 establishes a coherent visual system and interaction baseline across Setup, Input, Jobs, and Output with consistent hierarchy, component states, and responsive behavior. This phase also introduces a theme-ready foundation, but implementation starts with one baseline theme first.

</domain>

<decisions>
## Implementation Decisions

### Theme Strategy and Baseline Visual Direction

- Support multiple themes as a product direction, but implement Theme 01 first.
- Theme 01 direction is creative-studio dark with burnt-orange/copper accents.
- Accent intensity should be balanced, not neon-heavy.
- Use clean dark surfaces with subtle gradients (not flat backgrounds).
- Typography should use a modern neutral sans style.
- Corner rounding should be slight (approximately 6-8px feel).
- Motion should stay minimal and purposeful.
- Contrast should be balanced for readability without harsh extremes.

### Tab Navigation System

- Use a floating segmented top rail with a glass-dark treatment.
- Tab icons use outline style by default and filled style when active.
- Active tab uses a full pill background treatment.
- Inactive tabs use subtle outline pills with muted text.

### Layout Hierarchy

- Use a two-tier header:
  - Row 1 for title/version and global status.
  - Row 2 for contextual controls tied to active tab.
- Use adaptive canvas layout so each tab can choose its best internal arrangement.
- Default density is balanced.
- Section emphasis is hybrid:
  - Key actions in clear card containers.
  - Secondary information in flatter sections.

### Components and State Behavior

- Button hierarchy is contextual:
  - Solid burnt-orange fill for truly primary actions.
  - Outline/lower-emphasis treatment for secondary actions.
  - Destructive actions use a separate danger style (not orange).
- Status feedback uses a hybrid model:
  - Inline feedback for persistent/running/error state.
  - Toast notifications for transient confirmations.
- Long-running jobs in UI use per-job cards with spinner/state text.
- Empty states should be minimal text-only placeholders.

### Responsive Behavior

- Mobile navigation is adaptive:
  - Tablet: top scrollable tab rail.
  - Phone: bottom navigation with the same four destinations.
- On small screens, keep two header rows but reduce spacing density.
- Mobile forms use full single-column stacking (no side-by-side controls).
- Mobile primary action uses a sticky bottom action bar pattern.

### Copilot's Discretion

- Exact token names, CSS variable structure, and theme-switching API can be chosen during implementation as long as Theme 01 ships first and later themes can be added without major refactor.
- Minor spacing and breakpoint refinements are allowed if they preserve the decisions above.

</decisions>

<specifics>
## Specific Ideas

- Theme architecture should separate semantic tokens (surface/text/accent/state) from component usage so later themes can be introduced via token swaps.
- The four-tab model (Setup, Input, Jobs, Output) remains the navigation backbone throughout this phase.

</specifics>

<deferred>
## Deferred Ideas

- Additional named themes beyond Theme 01 are intentionally deferred to later implementation work after the baseline visual system ships.

</deferred>

---

_Phase: 06-ui-refresh-and-interaction-foundation_
_Context gathered: 2026-05-24_