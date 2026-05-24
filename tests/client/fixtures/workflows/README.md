# Workflow Fixture Corpus

This fixture set anchors workflow import and template reuse behavior for browser-local persistence tests.

## Sources

- comfyui-valid-template.json: representative ComfyUI graph with input-bearing nodes.
- comfyui-invalid-template-missing-input-node.json: parseable near-miss graph where template-rule checks fail.
- wpf-legacy-template.json: parseable legacy export shape used for non-blocking import regression checks.

## Usage Rules

- Preserve fixture content verbatim once committed.
- Add new fixtures as separate files instead of rewriting existing ones.
- Reuse these fixtures for import, persistence, and repeat-run tests to keep behavior stable across refresh boundaries.
