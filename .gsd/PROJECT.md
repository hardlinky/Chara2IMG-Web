# Chara2Img Web — Project Context

## What This Is

A full-stack TypeScript web frontend (React + Hono) for running ComfyUI image generation workflows on RunPod. Users import workflow templates, fill dynamic inputs, submit jobs, and view generated images.

## The Problem Being Solved

The current system treats the **client as the primary job store**. Images are stored as base64 data URLs inline in IndexedDB job records. The server has a parallel "recent jobs" store that mirrors client state, creating confusing duplication. This fragility caused the loss of 300 saved jobs when the store became corrupt/oversized.

A second problem: the server's `runpodJobStateStore` uses `writeFileSync` on every state update (blocks the Node.js event loop), and `recentJobsStore` (server) imports directly from `src/client/lib/` (violates the three-zone architecture).

## The Vision

**Server is the single source of truth.** Jobs and their images live on the server filesystem. The client polls the server for state — it does not manage jobs itself. Images have a 1-hour TTL; users can pin images to move them to persistent storage. Both sides maintain lightweight manifests visible in the admin panel.

## Core Value

Users never lose generated images due to client-side storage fragility. Every completed image lives on the server until it naturally expires or is explicitly deleted.

## Architecture Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Server-authoritative job store | Client-side IndexedDB caused data loss | Decided — replace |
| Per-job directory structure (`/tmp/chara2img/jobs/{jobId}/`) | Images as files, not base64 blobs | Decided — implement |
| 1-hour image TTL from job completion | Simple timer, no complex retention logic | Decided — implement |
| Pin = archive to persistent dir | Survives tmp purges, clear user intent | Decided — implement |
| Async-only server I/O | No `writeFileSync` blocking event loop | Decided — implement |
| `extractRunpodOutputImages` moves to `src/shared/` | Server was importing from client lib | Decided — move |
| Replace all old systems (recentJobsStore, runpodJobStateStore, pinnedImageStorageStats) | No migration — forward redesign only | Decided — replace |

## Requirements

### Validated

(None — brownfield replacement, existing functionality does not meet requirements)

### Active

**Job Management**
- [ ] JOB-01: User can submit a job to RunPod via server proxy
- [ ] JOB-02: Server tracks job status by polling RunPod in background
- [ ] JOB-03: Client polls server (not RunPod directly) for job status
- [ ] JOB-04: Server stores job metadata (template, inputs, raw response) as files in `/tmp/chara2img/jobs/{jobId}/`
- [ ] JOB-05: Server extracts images from completed job responses and writes them as individual image files
- [ ] JOB-06: Client can view list of jobs and their statuses
- [ ] JOB-07: Client can delete a job

**Image Serving**
- [ ] IMG-01: Server serves job images via `GET /api/jobs/{jobId}/images/{index}`
- [ ] IMG-02: Images have a 1-hour TTL starting from job completion timestamp
- [ ] IMG-03: Client caches images locally for the same 1-hour window
- [ ] IMG-04: After TTL, server purges unpinned images from `/tmp`
- [ ] IMG-05: After TTL, client removes unpinned images from local cache

**Pinning / Archive**
- [ ] PIN-01: User can pin an image; server archives it to persistent directory
- [ ] PIN-02: When a pinned image's client TTL expires, client marks it "archived" and re-fetches from server
- [ ] PIN-03: User can unpin an archived image; server moves it back to `/tmp` and starts a new 1hr countdown
- [ ] PIN-04: If unpinned (post-archive) image is not re-pinned within 1hr, server purges it
- [ ] PIN-05: Client purges unpinned image from local cache after countdown expires

**Manifests**
- [ ] MAN-01: Server maintains a manifest of all jobs, images, TTL timestamps, and pin/archive status
- [ ] MAN-02: Client maintains a lightweight manifest of known jobs and image expiry state
- [ ] MAN-03: Admin panel shows server manifest and client manifest
- [ ] MAN-04: Admin can delete manifest entries and force-purge images

**Architecture / Internal**
- [ ] ARCH-01: All server filesystem operations use async I/O (no `writeFileSync`)
- [ ] ARCH-02: `extractRunpodOutputImages` moved from `src/client/lib/` to `src/shared/`

### Out of Scope

- Recovery of the 300 lost jobs — forward-looking redesign only
- Old `recentJobsStore`, `runpodJobStateStore`, `pinnedImageStorageStats` — replaced, not extended
- Per-client pinned image manifests (old system) — replaced by single server manifest
- Multi-user isolation — single-user/trusted deployment assumption unchanged

## Key Constraints

- Three-zone architecture (`src/client`, `src/server`, `src/shared`) must be preserved
- No new external dependencies unless clearly necessary
- All existing tests must be updated to reflect the new model
- Workflow import/editing subsystem is **not** in scope — untouched

---

_Last updated: 2026-06-17 after initialization_
