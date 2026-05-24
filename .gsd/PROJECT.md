# Chara2Img Web

## What This Is

Chara2Img Web is a browser-based app for invited users to run ComfyUI image generation jobs against Runpod serverless endpoints without keeping a local ComfyUI instance running. It ships full core WPF parity in web form: secure invite access, BYOK key handling, workflow template import/reuse, dynamic input editing and apply-back, job lifecycle management, and output gallery/lightbox review.

## Core Value

Enable reliable full-parity web generation workflows against Runpod serverless ComfyUI, with user-supplied API keys and no always-on ComfyUI host.

## Current Milestone: v1.1 UX and QOL

**Goal:** Improve day-to-day usability, editing efficiency, and output review quality without changing core Runpod workflow parity guarantees.

**Target features:**

- Visual refresh pass across the full app shell before feature expansions.
- Workflow presets and faster setup reuse paths.
- Input editor quality-of-life controls and safer feedback loops.
- Jobs and outputs browsing improvements (filtering, metadata, readability).

## Requirements

### Validated

- ✓ User can load custom ComfyUI workflow JSON templates in the web app. - v1.0
- ✓ User can edit workflow-derived inputs and submit jobs using those values. - v1.0
- ✓ User can view and manage a jobs list, including rerun, load inputs, cancel, and remove. - v1.0
- ✓ User can view generated outputs in a gallery flow with per-job provenance. - v1.0
- ✓ User can provide their own Runpod API key with browser-local remember support. - v1.0
- ✓ Backend proxy supports full Runpod job lifecycle calls (run, status polling, cancel) for WPF parity. - v1.0

### Active

- [ ] App has a coherent visual system (typography, spacing, hierarchy, colors) across Setup/Input/Jobs/Output tabs.
- [ ] App interaction states are visually clear and accessible (focus, hover, active, disabled, error).
- [ ] Users can save and reuse named workflow presets.
- [ ] Users can quickly apply prior run inputs and preset combinations with fewer manual steps.
- [ ] Input editor supports additional quality-of-life controls while preserving payload fidelity.
- [ ] Jobs list UX supports faster triage through clearer statuses and filtering affordances.
- [ ] Outputs UX supports better review context (notes/tags/metadata summaries).
- [ ] Admin invite management and cross-device job tracking remain deferred to a later milestone.

### Out of Scope

- Native desktop packaging - focus is web deployment on lightweight Runpod pod.
- Public self-serve multi-tenant launch - initial release targets invited users only.
- Building or hosting a persistent ComfyUI runtime - rely on existing Runpod serverless endpoint.
- Offline-first local generation mode - product remains Runpod-serverless centered.

## Context

v1.0 shipped end-to-end invited-user workflow generation parity. Current UI navigation is split into Setup/Input/Jobs/Output tabs. Dynamic parsing supports `_meta.title` defaults, optional `[Input]` (no index) ordering, lora-row editing, and expanded class-type mappings. The stack is TypeScript + React + Vite client, Hono backend proxy, Dexie browser persistence, and Vitest coverage.

## Constraints

- **Deployment**: Must run on a lightweight Runpod pod - keep backend and runtime footprint minimal.
- **Security**: Support BYOK (bring your own key) with browser-local remember option - avoid server-side long-term key persistence.
- **Compatibility**: Must preserve full WPF functional parity for core generation workflows - migration should not drop existing capabilities.
- **Audience**: Small invited users in v1 - optimize for private usability before public hardening.

## Key Decisions

| Decision | Rationale | Outcome |
| -------- | --------- | ------- |
| Full parity scope for v1 | Existing WPF workflows are already proven and required by user | ✓ Good - shipped in v1.0 |
| Web architecture uses frontend plus lightweight backend proxy | Better control and safer key handling than direct browser-to-Runpod calls | ✓ Good - scalable and testable boundary |
| User-supplied Runpod API key with browser-local remember option | Needed for invited users using their own accounts with acceptable convenience | ✓ Good - shipped with browser-local persistence |
| Keep canonical workflow JSON and rebuild payload per run | Guarantees deterministic apply-back and avoids template mutation | ✓ Good - stable run behavior and repeatability |
| Projection-first outputs contract | Prevent UI from coupling to raw Runpod payload shape changes | ✓ Good - enabled clean gallery/lightbox features |
| Split navigation into Setup/Input/Jobs/Output tabs | Reduce context overload in single run surface and isolate workflows | ✓ Good - clearer user flow post-v1 polish |

---

_Last updated: 2026-05-24 after v1.1 milestone initialization_
