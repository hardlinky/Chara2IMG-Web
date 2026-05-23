# Chara2Img Web

## What This Is

Chara2Img Web is a browser-based app for small invited users to run ComfyUI image generation jobs against Runpod serverless endpoints without keeping a local ComfyUI instance running. It ports the full WPF workflow to web, including custom workflow templates, dynamic input editing, job control, reruns, and output gallery viewing. Users can supply their own Runpod API key with a browser-local remember option.

## Core Value

Enable reliable full-parity web generation workflows against Runpod serverless ComfyUI, with user-supplied API keys and no always-on ComfyUI host.

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] User can load custom ComfyUI workflow JSON templates in the web app.
- [ ] User can edit workflow-derived inputs in an Input tab and submit jobs using those values.
- [ ] User can view and manage a jobs list, including rerun, load inputs from job, cancel, and remove.
- [ ] User can view generated outputs in a gallery tab.
- [ ] User can provide their own Runpod API key with browser-local remember support.
- [ ] Backend proxy supports full Runpod job lifecycle calls (run, status polling, cancel) for full WPF parity.

### Out of Scope

- Native desktop packaging - focus is web deployment on lightweight Runpod pod.
- Public self-serve multi-tenant launch - initial release targets invited users only.
- Building or hosting a persistent ComfyUI runtime - rely on existing Runpod serverless endpoint.

## Context

This project ports an existing .NET WPF app integration to web. The current WPF app already supports Runpod bearer auth, workflow JSON parsing based on [Input]/[Input#] node titles, dynamic typed input controls, workflow input application before submit, polling status, cancel operations, rerun/load-inputs behavior, and output gallery handling from base64 image responses. The web app should preserve that behavior while running on a lightweight Runpod pod and supporting users who bring their own API keys.

## Constraints

- **Deployment**: Must run on a lightweight Runpod pod - keep backend and runtime footprint minimal.
- **Security**: Support BYOK (bring your own key) with browser-local remember option - avoid server-side long-term key persistence.
- **Compatibility**: Must preserve full WPF functional parity for core generation workflows - migration should not drop existing capabilities.
- **Audience**: Small invited users in v1 - optimize for private usability before public hardening.

## Key Decisions

| Decision | Rationale | Outcome |
| -------- | --------- | ------- |
| Full parity scope for v1 | Existing WPF workflows are already proven and required by user | - Pending |
| Web architecture uses frontend plus lightweight backend proxy | Better control and safer key handling than direct browser-to-Runpod calls | - Pending |
| User-supplied Runpod API key with browser-local remember option | Needed for invited users using their own accounts with acceptable convenience | - Pending |

---

_Last updated: 2026-05-23 after initialization_
