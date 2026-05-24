# Project Milestones: Chara2Img Web

## v1.0 MVP (Shipped: 2026-05-24)

**Delivered:** Full invited-user Chara2Img web parity on Runpod with workflow import, dynamic inputs, job lifecycle controls, and output gallery review.

**Phases completed:** 1-5 (14 plans total)

**Key accomplishments:**

- Established invite-gated access, BYOK handling, and secure allowlisted Runpod proxy routes with redaction-safe failures.
- Added full-fidelity ComfyUI workflow import, validation, and browser-local template reuse.
- Delivered dynamic input derivation/apply-back with hybrid validation, lora-row controls, and broader node-class mapping parity.
- Implemented recent-jobs lifecycle orchestration: submit, poll, timeout, cancel, rerun, load prior inputs, and remove-visible flows.
- Shipped output projection, per-job gallery browsing, and PhotoSwipe lightbox with wheel zoom and scoped navigation.
- Split app UX into Setup/Input/Jobs/Output tabs and added env-default endpoint configuration with user override persistence.

**Stats:**

- 127 files created/modified
- 5,994 lines of TypeScript/TSX in src + tests
- 5 phases, 14 plans, 36 tasks
- 2 days from 2026-05-23 to 2026-05-24

**Git range:** `feat(01-01)` -> `feat(ui)`

**What's next:** Define v1.1 milestone scope (security hardening, admin workflows, and quality-of-life enhancements).

---
