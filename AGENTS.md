# Agent Rules

## Versioning Policy

- Use semantic version format: MAJOR.MINOR.PATCH.
- When asked to "update version" without explicit segment instructions, automatically bump PATCH by +1.
- Do not change MAJOR or MINOR unless the user explicitly asks.
- Expected sequence example: 1.1.0 -> 1.1.1 -> 1.1.2.
- For npm workflows, prefer: npm version patch --no-git-tag-version.
- Keep package-lock.json root version aligned when lockfile exists.
