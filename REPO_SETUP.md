# Repository Setup

## Recommended workflow

1. Create an empty GitHub repository, for example `hybrid-training-app`.
2. Clone it locally.
3. Copy this documentation package into the repository root.
4. Commit documentation before application code.
5. Connect/open that repository with Codex.
6. Give Codex only the Phase 0 prompt from `docs/06_implementation_plan.md`.
7. Review Phase 0 before authorizing Phase 1.

## Initial commit example

```bash
git add .
git commit -m "docs: define hybrid training app MVP"
git push
```

## Important

Do not run `create-expo-app` in a way that overwrites the `/docs`, `README.md` or `AGENTS.md` files.

Codex should initialize the application around the existing documentation.
