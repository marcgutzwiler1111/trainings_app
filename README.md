# Hybrid Training App

Personal mobile training app for a custom hybrid training system built around:

- Power
- Strength
- Circuit
- bodyweight-relative performance
- Power, Strength and Circuit benchmarks

## Status

Product specification prepared for MVP implementation.

The files in `/docs` are the product and technical source of truth.

## Documentation order

1. `docs/01_training_system.md`
2. `docs/02_product_requirements.md`
3. `docs/03_ux_user_flows.md`
4. `docs/04_data_model.md`
5. `docs/05_technical_architecture.md`
6. `docs/06_implementation_plan.md`

Codex and other implementation agents must also follow `AGENTS.md`.

## MVP technical direction

- Expo / React Native
- TypeScript
- Expo Router
- SQLite via `expo-sqlite`
- Local-first
- No login
- No backend
- No cloud sync
- Android and iOS capable

## Core principle

Do not invent product behavior when the documentation defines it.
If documents conflict, use this priority:

1. `02_product_requirements.md`
2. `03_ux_user_flows.md`
3. `04_data_model.md`
4. `05_technical_architecture.md`
5. `06_implementation_plan.md`

Product changes must be explicit.
