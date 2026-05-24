# Phase 06: UI Refresh and Interaction Foundation - Research

**Researched:** 2026-05-24
**Domain:** React UI system architecture, accessible tab navigation, state styling, and responsive interaction foundations
**Confidence:** HIGH

## Summary

Phase 06 should be planned as a design-system foundation pass over the existing four-tab product, not a component rewrite. The current UI is mostly unstyled semantic HTML (with one tab-specific stylesheet), which makes this phase ideal for introducing a global token layer, shared interaction primitives, and a predictable layout shell without changing feature logic from Phases 1-5.

Given locked decisions, the strongest implementation path is: one baseline dark creative-studio theme (Theme 01) built with semantic CSS tokens, a two-row header shell, a segmented glass-dark tab rail on desktop/tablet, and a bottom nav on phone. Keep behavior explicit and accessible: ARIA-compliant tabs, visible keyboard focus, reduced-motion support, and live-region patterns for inline status vs transient confirmation.

Primary planning risk is not visual polish but consistency drift: if token semantics, component states, and breakpoint behavior are not centralized early, each tab will evolve differently and Phase 06 will regress into one-off styling patches.

- Research scope covered: token architecture, tab semantics, focus/motion accessibility, mobile safe-area patterns, current repository UI surface
- Standard approach: semantic design tokens + shared shell/components + accessibility-first state styling
- Key recommendation: ship Theme 01 through a tokenized global stylesheet and reusable shell primitives before tab-level visual refinements

**Primary recommendation:** Plan Phase 06 to first establish a semantic token and app-shell layer (`theme -> shell -> components -> tab content`), then restyle each tab against that shared foundation.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| React | 19.x (repo uses 19.0.0) | Component composition for shell, tab rail, stateful controls | Existing app runtime; no migration risk |
| Web Platform: CSS custom properties (`--*`, `var()`) | Baseline widely available | Semantic theming tokens and theme swapping | Native, performant, and ideal for theme-ready architecture |
| WAI-ARIA Tabs Pattern | Current APG guidance | Accessible keyboard/focus semantics for 4-tab model | Prevents custom-tab accessibility regressions |
| WCAG 2.2 AA focus/contrast guidance | Current W3C guidance | Focus visibility and readable contrast in dark UI | Required for consistent and testable state behavior |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| CSS `:focus-visible` | Baseline widely available | Keyboard-first focus ring styling without mouse noise | Use for all interactive controls |
| CSS `@media (prefers-reduced-motion)` | Baseline widely available | Minimal and accessible motion behavior | Use for all transitions/animation fallbacks |
| CSS `env(safe-area-inset-*)` | Baseline widely available | Safe mobile sticky bottom action/nav spacing | Use for phone bottom action bar/nav |
| Dynamic viewport units (`svh`, `dvh`) | Supported in major engines | Stable mobile layout with dynamic browser chrome | Use on mobile shell and sticky regions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Native tokenized CSS layer | Full UI framework replacement | Faster presets, but high restyle cost and higher regression risk for existing tested flows |
| ARIA tabs semantics | Click-only custom segmented buttons | Easier to code, but keyboard/screen-reader behavior becomes non-compliant |
| CSS token system with semantic aliases | Direct hard-coded color values in components | Faster short-term, but blocks multi-theme evolution and causes inconsistency drift |

**Installation:**
```bash
# No new dependency is required for Phase 06 foundation.
# Use existing React + Vite stack; add optional libs only if planning explicitly chooses them.
```

## Architecture Patterns

### Recommended Project Structure

```text
src/client/
├── styles/
│   ├── tokens.css              # semantic + component tokens (Theme 01 default)
│   ├── base.css                # reset/base typography/body/canvas
│   ├── layout.css              # app shell, two-row header, adaptive canvas
│   └── components.css          # buttons, pills, cards, status, forms
├── components/
│   ├── app-shell/
│   │   ├── AppShell.tsx        # two-tier header + active-tab canvas
│   │   ├── TopTabRail.tsx      # floating segmented rail (desktop/tablet)
│   │   └── BottomTabNav.tsx    # phone nav mirror destinations
│   └── feedback/
│       ├── InlineStatus.tsx    # persistent/running/error inline feedback
│       └── ToastRegion.tsx     # transient confirmations via polite live region
└── App.tsx                     # keeps business orchestration; delegates shell rendering
```

### Pattern 1: Semantic Token Layer First

**What:** Separate semantic tokens (surface/text/accent/state) from component tokens and use Theme 01 values as defaults.
**When to use:** Before any per-tab restyling.
**Example:**
```css
/* Source: MDN custom properties guidance */
:root,
[data-theme="theme-01"] {
  --color-surface-canvas: #111417;
  --color-surface-panel: #181d22;
  --color-surface-elevated: #20262d;

  --color-text-primary: #e9edf2;
  --color-text-muted: #a8b1bc;

  --color-accent-primary: #c56a36;
  --color-accent-primary-hover: #d47942;

  --color-danger: #cf4b4b;
  --radius-sm: 6px;
  --radius-md: 8px;
}
```

### Pattern 2: Accessible Segmented Tab Rail

**What:** Implement top segmented rail with real tab semantics (`tablist`, `tab`, `tabpanel`) and keyboard behavior.
**When to use:** Setup/Input/Jobs/Output navigation in both desktop and tablet top rail.
**Example:**
```tsx
// Source: WAI APG tabs pattern roles/states
<div role="tablist" aria-label="Primary navigation">
  {tabs.map((tab) => (
    <button
      key={tab.id}
      id={`tab-${tab.id}`}
      role="tab"
      aria-selected={activeTab === tab.id}
      aria-controls={`panel-${tab.id}`}
      tabIndex={activeTab === tab.id ? 0 : -1}
      onClick={() => setActiveTab(tab.id)}
    >
      {tab.label}
    </button>
  ))}
</div>
```

### Pattern 3: Hybrid Feedback Model (Inline + Toast)

**What:** Keep persistent/running/error states inline near the owning control, and use polite live-region toast for short confirmations.
**When to use:** Save, loaded, rerun queued, cancellation requested, etc.
**Example:**
```tsx
// Source: MDN ARIA live region guidance
<div role="status" aria-live="polite" aria-atomic="true">
  {toastMessage}
</div>
```

### Pattern 4: Mobile Shell Stability

**What:** Use phone-specific bottom nav and sticky primary action bar with safe-area insets and dynamic viewport-safe sizing.
**When to use:** <= phone breakpoint while preserving two-row header at reduced density.
**Example:**
```css
/* Source: MDN env() + web.dev viewport units */
.mobile-action-bar {
  position: sticky;
  bottom: 0;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
}

.app-shell {
  min-height: 100dvh;
}
```

### Anti-Patterns to Avoid

- Hard-coding colors/spacing directly in tab feature components.
- Replacing native focus outline without a robust `:focus-visible` alternative.
- Building click-only tabs that omit ARIA roles/keyboard interaction.
- Mixing primary/destructive color semantics (orange used for danger).
- Applying heavy animations that ignore reduced-motion preferences.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Accessible tabs keyboard model | Ad-hoc arrow-key logic without ARIA contract | WAI-ARIA APG Tabs pattern | Prevents focus/order/state bugs and accessibility regressions |
| Focus visibility heuristics | Custom JS modality tracking for every control | Native `:focus-visible` behavior + fallback | Browser heuristics already solve pointer vs keyboard focus display |
| Toast announcement semantics | Visual-only transient notifications | Live-region `role="status"` polite announcements | Keeps transient feedback available to assistive tech |
| Mobile safe-area math | Device-specific hard-coded bottom padding | `env(safe-area-inset-bottom)` | Handles notches/home indicators consistently |

**Key insight:** Phase 06 complexity is in consistency and accessibility semantics, not in custom interaction mechanics. Reuse platform standards and APG patterns.

## Common Pitfalls

### Pitfall 1: Token Taxonomy Collapse

**What goes wrong:** Semantic and component tokens are mixed, making theme extension painful.
**Why it happens:** Teams directly bind component styles to raw palette values.
**How to avoid:** Keep a two-layer model: semantic tokens (`--color-surface-*`) and component aliases (`--button-primary-bg`).
**Warning signs:** Same hex value repeated across multiple component files.

### Pitfall 2: Inaccessible Segmented Rail

**What goes wrong:** Tabs look correct but keyboard navigation is broken or silent to screen readers.
**Why it happens:** Missing `role="tablist"`, `role="tab"`, `aria-selected`, and roving tab index.
**How to avoid:** Implement APG tab semantics from the start and test arrow/home/end behavior.
**Warning signs:** Keyboard focus enters all tabs sequentially or selected state is not announced.

### Pitfall 3: Focus Ring Regression

**What goes wrong:** New visual polish removes visible focus indicator.
**Why it happens:** Global `outline: none` or low-contrast focus styles in dark UI.
**How to avoid:** Add explicit high-contrast `:focus-visible` styles and fallback behavior.
**Warning signs:** Keyboard users cannot tell which button/control is active.

### Pitfall 4: Mobile Bottom Action Obstruction

**What goes wrong:** Sticky bottom action/nav overlaps with OS gesture area or browser chrome.
**Why it happens:** Fixed bottom bars omit safe-area and dynamic viewport behavior.
**How to avoid:** Use `env(safe-area-inset-bottom)` and `100dvh` shell sizing with tested phone breakpoints.
**Warning signs:** Primary action partially hidden on iOS/Android devices.

### Pitfall 5: Feedback Channel Confusion

**What goes wrong:** Persistent errors and short confirmations are both routed to the same visual style/location.
**Why it happens:** No explicit feedback taxonomy.
**How to avoid:** Inline for persistent/running/error; toast for short confirmation only.
**Warning signs:** Users miss important errors after a toast timeout or see noisy persistent confirmations.

## Code Examples

Verified patterns from official sources:

### Focus-visible with fallback

```css
/* Source: MDN :focus-visible */
.interactive:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
}

@supports not selector(:focus-visible) {
  .interactive:focus {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }
}
```

### Reduced-motion guard for transitions

```css
/* Source: MDN prefers-reduced-motion */
.card,
.tab-pill,
.button {
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .tab-pill,
  .button {
    transition: none;
  }
}
```

### Live-region status pattern

```tsx
// Source: MDN ARIA live regions
<p role="status" aria-live="polite" aria-atomic="true">
  {statusMessage}
</p>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Hard-coded per-component color values | Semantic token systems via CSS custom properties | Matured as mainstream CSS architecture; current MDN guidance | Makes single-theme shipping and multi-theme expansion low-risk |
| Click-only visual tabs | ARIA tab pattern with keyboard semantics | Established APG pattern and current accessibility practice | Ensures keyboard/screen-reader parity for segmented navigation |
| `100vh` mobile shells | `svh/lvh/dvh` viewport units + safe-area handling | Shipped across major engines (documented by web.dev) | Prevents clipping/overlap with mobile browser UI |
| Removing outlines for aesthetics | `:focus-visible` tuned indicators | Broad support in current engines | Preserves accessibility with cleaner pointer behavior |

**Deprecated/outdated:**

- Using `outline: none` globally without replacement focus indication.
- Treating `100vh` as reliable on mobile with dynamic browser UI.
- Treating visual tab pills as navigation without ARIA semantics.

## Open Questions

1. **Theme switch API shape (deferred multi-theme direction)**
   - What we know: Theme 01 ships first; future themes must avoid major refactor.
   - What's unclear: whether to drive theme via `data-theme` attribute, persisted local setting, or server profile.
   - Recommendation: start with `data-theme="theme-01"` and isolate switch mechanism behind a tiny `themeStorage` utility.

2. **Typography asset strategy**
   - What we know: decision requires modern neutral sans style.
   - What's unclear: web-hosted font vs bundled local font and impact on load/perf/privacy.
   - Recommendation: choose one font family in planning with explicit fallback stack and measure first paint impact.

3. **Toast implementation detail**
   - What we know: transient confirmations are required.
   - What's unclear: whether to keep a small internal toast region or adopt a dedicated toast package.
   - Recommendation: default to internal minimal toast implementation in Phase 06 unless orchestration complexity grows.

## Sources

### Primary (HIGH confidence)

- Repository inspection:
  - `src/client/App.tsx`
  - `src/client/features/access/InviteGate.tsx`
  - `src/client/features/inputs/DynamicInputEditor.tsx`
  - `src/client/features/jobs/RecentJobsPanel.tsx`
  - `src/client/features/outputs/OutputsTab.tsx`
  - `src/client/features/outputs/outputsGallery.css`
  - `package.json`
- W3C WAI APG tabs pattern:
  - https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- WCAG 2.2 understanding docs:
  - https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
  - https://www.w3.org/WAI/WCAG22/Understanding/focus-visible
- MDN official docs:
  - https://developer.mozilla.org/en-US/docs/Web/CSS/--*
  - https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascading_variables/Using_CSS_custom_properties
  - https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible
  - https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
  - https://developer.mozilla.org/en-US/docs/Web/CSS/env
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions

### Secondary (MEDIUM confidence)

- web.dev implementation guidance:
  - https://web.dev/blog/viewport-units

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - grounded in official platform/W3C guidance and current repo dependencies
- Architecture: HIGH - directly aligned to locked phase decisions and existing app structure
- Pitfalls: HIGH - drawn from WCAG/APG requirements and observed repository baseline

**Research date:** 2026-05-24
**Valid until:** 2026-06-23 (30 days)