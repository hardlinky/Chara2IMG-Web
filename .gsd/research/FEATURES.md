# Feature Research

**Domain:** Runpod + ComfyUI workflow web client for small invited users
**Researched:** 2026-05-23
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
| --------- | ------------------ | --------------- | ---------------------- |
| Workflow JSON import and reload | ComfyUI itself supports saving/loading workflows as JSON and loading workflows from prior outputs; hosted clients like RunComfy position "upload and edit your own" workflow support as baseline. | MEDIUM | Must validate workflow shape, preserve prompt metadata, and handle missing custom-node inputs gracefully. |
| Dynamic input surface for exposed workflow parameters | Hosted workflow products compete by hiding node complexity behind text fields, sliders, and uploads instead of forcing users into the graph. | HIGH | For this app, dynamic input tab generation is core. The hardest part is reliably mapping arbitrary workflow JSON into a stable form schema. |
| Queue-based job submission with status updates | ComfyUI has an asynchronous queue system, and Runpod queue-based endpoints center around submit, status, and result retrieval. | MEDIUM | Requires durable client-side job state, polling or streaming status, and clear queued/running/completed/failed/canceled states. |
| Job list with rerun, load-inputs, cancel, and remove | ComfyUI exposes queue/history concepts, and users expect to iterate from previous runs instead of rebuilding inputs manually. | MEDIUM | "Load inputs" depends on storing normalized input snapshots per run, not only raw workflow blobs. |
| Output gallery with per-result provenance | Users expect generated outputs to remain browsable after the queue clears; ComfyUI also treats generated outputs as workflow carriers. | MEDIUM | Gallery items should retain prompt/workflow/job linkage so a result can feed rerun/load-inputs actions. |
| Failure visibility and retry-safe behavior | Runpod jobs can queue, cold start, fail, or time out; a workflow client without actionable error states feels unreliable immediately. | MEDIUM | Need surfaced Runpod endpoint errors, cancellation results, timeout messaging, and safe retry semantics. |
| Secure API key entry for endpoint access | Any client aimed at personal or invited-user infra use needs a sane way to supply credentials before jobs can run. | LOW | Table stakes is secure entry and session use. Persisted browser-local remember is a product choice, not a category baseline. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
| --------- | ----------------- | --------------- | ---------------------- |
| BYOK with browser-local remember | Strong fit for a small invited cohort: users keep control of Runpod credentials and the product avoids becoming a billing proxy. | MEDIUM | Valuable because many hosted competitors abstract billing behind credits rather than using the user's own infrastructure. Must be explicit that storage is browser-local only. |
| Workflow-aware form generation that works across many custom JSONs | The more arbitrary ComfyUI workflows the app can ingest without manual app-building, the more leverage it gives compared with fixed-purpose generators. | HIGH | This is the main product differentiator if it works reliably. It needs conventions for picking exposed inputs, grouping fields, and validating file/image inputs. |
| Reproducibility loop from gallery to rerun | Fast iteration matters more than broad feature count for this app type. One-click rerun and load-inputs from a prior output shortens the creative loop. | MEDIUM | Stronger than a passive gallery. Requires immutable run records plus a normalized mapping back to editable inputs. |
| Opinionated job workspace optimized for long-running GPU tasks | A focused queue view, cancel behavior, stale-job recovery, and clear cost/runtime awareness can outperform generic hosted UIs for invited power users. | MEDIUM | Useful because Runpod introduces queueing and cold-start semantics that many consumer AI tools hide. |
| Lightweight, app-mode-style UX without exposing the full node editor | Comfy Cloud and ComfyDeploy both highlight simplified UI layers for non-graph users. Doing this cleanly for private workflows is a usability advantage. | MEDIUM | Differentiate on clarity, not breadth. Expose only high-signal controls while keeping workflow provenance intact. |
| Presets for recurring character/workflow setups | For a Chara2Img product, saved presets can turn a generic workflow runner into a purpose-built tool for repeatable character generation. | MEDIUM | Best added after core import/job/gallery loop is stable. Depends on durable input schema normalization. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
| --------- | ---------------- | ----------------- | ----------------- |
| Full in-browser ComfyUI graph editor in v1 | Sounds like "complete parity" with desktop ComfyUI. | It explodes scope into canvas UX, node compatibility, graph persistence, and custom-node UI semantics; it also weakens the product's simplified workflow-client positioning. | Keep v1 focused on workflow import plus dynamic parameter UI; defer graph editing unless repeated user demand proves it necessary. |
| Server-side storage of user API keys and secrets | Feels convenient for multi-device access. | Raises the security and trust bar sharply for a small invited-user app and turns a thin client into a secrets platform. | Keep BYOK browser-local only in v1, with clear opt-in remember behavior. |
| Broad team collaboration suite (roles, approvals, comments, shared asset libraries) | Competitors like ComfyDeploy target teams, so this is tempting to match early. | Misaligned with the project's invited-user scope and adds heavy backend/state requirements before the core workflow loop is proven. | Support single-user or lightweight invite access first; revisit shared workspaces only if the product expands beyond the initial cohort. |
| Multi-provider abstraction across many GPU backends in v1 | Seems like a hedge against Runpod lock-in. | It dilutes the product around the wrong abstraction boundary because queue semantics, auth, file handling, and status models differ substantially by provider. | Build tightly around Runpod first and keep a provider adapter seam internally. |
| Auto-syncing every generated asset to a central cloud library | Sounds useful for permanence and sharing. | Creates storage, privacy, and cost obligations that are unnecessary for validating the workflow client itself. | Start with a gallery backed by output metadata and explicit export/download actions. |

## Feature Dependencies
```
[Dynamic input surface]
└──requires──> [Workflow JSON import and validation]
└──requires──> [Input schema extraction rules]

[Job submission and status]
└──requires──> [Runpod endpoint configuration]
└──requires──> [Secure API key entry]

[Job list actions: rerun/load inputs]
└──requires──> [Persisted run records]
└──requires──> [Normalized input snapshots]

[Output gallery]
└──requires──> [Persisted run records]
└──requires──> [Output provenance metadata]

[Presets]
└──requires──> [Stable dynamic input schema]

[Full graph editor]
──conflicts-with──> [Lightweight app-mode UX]

[Server-side key storage]
──conflicts-with──> [Browser-local BYOK trust model]
```

### Dependency Notes

- **Dynamic input surface requires workflow import and validation:** The form cannot be trustworthy unless the imported workflow is parsed into a consistent intermediate representation first.
- **Dynamic input surface requires input schema extraction rules:** Arbitrary ComfyUI JSON is too flexible to render directly; the product needs conventions for which nodes and fields become user-editable controls.
- **Job submission and status requires Runpod endpoint configuration:** Queue polling, cancel behavior, and result retrieval all depend on a stable contract with the chosen Runpod endpoint.
- **Job submission and status requires secure API key entry:** Without credentials the client cannot submit or inspect jobs, making auth entry a gating dependency.
- **Job list actions require persisted run records:** Rerun/load-inputs only work if each job stores both source workflow identity and the actual effective inputs used for that run.
- **Output gallery requires output provenance metadata:** A gallery is much more valuable when each item can map back to its originating run and workflow.
- **Presets require a stable dynamic input schema:** Saved presets become brittle if exposed field names and grouping are not normalized across imports.
- **Full graph editor conflicts with lightweight app-mode UX:** One product direction emphasizes exposed workflow parameters; the other exposes the whole graph and a much heavier interaction model.
- **Server-side key storage conflicts with the browser-local BYOK trust model:** Persisting secrets centrally changes the security posture and operational burden of the product.

## MVP Definition

### Launch With (v1)

Minimum viable product — what is needed to validate the concept.

- [x] Workflow JSON import and validation — core to making external ComfyUI workflows usable in the web client.
- [x] Dynamic input tab population for exposed parameters — the product is not meaningfully differentiated without this simplification layer.
- [x] Queue-based submission and status tracking — required because Runpod/ComfyUI execution is asynchronous and users need feedback.
- [x] Job list with rerun, load-inputs, cancel, and remove — matches the stated must-have iteration loop.
- [x] Output gallery with provenance back to jobs — required for browsing results and turning history into repeatable work.
- [x] BYOK entry with browser-local remember — appropriate to the small invited-user model and part of the stated v1 scope.
- [x] Error handling for failed/canceled/timed-out jobs — necessary for trust in a remote GPU workflow client.

### Add After Validation (v1.x)

- [ ] Saved presets per workflow — add once imported workflows and dynamic forms are stable enough that reuse beats ad hoc reruns.
- [ ] Better progress feedback and partial preview handling — add if users regularly wait on long-running jobs and need richer status than queued/running/completed.
- [ ] Workflow catalog / starter templates — add when onboarding new invited users becomes a larger concern than raw workflow flexibility.

### Future Consideration (v2+)

- [ ] Shareable run links or lightweight collaboration — only worth adding if usage expands beyond mostly individual invited users.
- [ ] Team workspaces and shared asset management — defer until there is a real multi-user coordination problem.
- [ ] Multi-provider backend abstraction — revisit only after Runpod-specific ergonomics are strong and validated.
- [ ] Full graph editing or node-level debugging — only justify this if users consistently hit the ceiling of the simplified workflow-client model.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Workflow JSON import and validation | HIGH | MEDIUM | P1 |
| Dynamic input tab population | HIGH | HIGH | P1 |
| Queue-based job submission and status | HIGH | MEDIUM | P1 |
| Job list actions (rerun/load inputs/cancel/remove) | HIGH | MEDIUM | P1 |
| Output gallery with provenance | HIGH | MEDIUM | P1 |
| BYOK with browser-local remember | HIGH | MEDIUM | P1 |
| Failure states and retry-safe behavior | HIGH | MEDIUM | P1 |
| Saved presets per workflow | MEDIUM | MEDIUM | P2 |
| Rich previews / progress streaming | MEDIUM | HIGH | P2 |
| Workflow catalog / templates | MEDIUM | LOW | P2 |
| Share links / lightweight collaboration | MEDIUM | MEDIUM | P3 |
| Team workspace features | LOW | HIGH | P3 |
| Multi-provider backend abstraction | LOW | HIGH | P3 |
| Full graph editor | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| Workflow import / reuse | RunComfy promotes uploading and editing your own workflow in-browser. | Comfy Cloud emphasizes browsing, running, and remixing community workflows. | Focus on importing private workflow JSONs directly and making them operable through a simplified client surface. |
| Simplified UI over complex workflows | ComfyDeploy auto-generates a playground UI from workflow input/output nodes. | Comfy Cloud highlights App Mode links so teammates can run workflows without training. | Make dynamic input tabs the primary UX, tuned for a small invited user set rather than a public app marketplace. |
| Queue / concurrency handling | RunComfy highlights an efficient queue system. | Comfy Cloud markets concurrent jobs on cloud GPUs. | Make the queue explicit with job controls and history instead of hiding it behind a generic spinner. |
| Team sharing / deployment | ComfyDeploy leans into shareable workflows, team environments, API deployment, and versioning. | Comfy Cloud supports team onboarding and shared up-to-date platform access. | Defer heavy collaboration and deployment features; optimize first for individual invited users running private workflows. |
| Credential model | Hosted products usually abstract infrastructure behind subscriptions or credits. | Hosted products usually abstract infrastructure behind subscriptions or credits. | Differentiate with BYOK and browser-local remember so users retain direct control of Runpod access. |

## Sources

- ComfyUI README and feature list: https://github.com/Comfy-Org/ComfyUI
- Runpod Serverless overview and request model: https://docs.runpod.io/serverless/overview
- Runpod inference product positioning: https://www.runpod.io/use-cases/inference
- RunComfy ComfyUI Online feature page: https://www.runcomfy.com/comfyui-web
- Comfy Cloud product page: https://www.comfy.org/cloud
- ComfyDeploy product page: https://www.comfydeploy.com/

---
*Feature research for: Runpod + ComfyUI workflow web client for small invited users*
*Researched: 2026-05-23*