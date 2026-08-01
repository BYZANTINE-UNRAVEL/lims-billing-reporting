# Maintenance guide

## Source layout

- `src/app/features`: Angular feature components.
- `electron-main/services`: trusted desktop services and domain persistence.
- `migrations`: reviewable SQLite schema documentation.
- `tests/e2e`: Playwright workflow coverage.
- `tools`: maintained project utilities only.

Generated builds, caches, test reports, patch files, temporary snapshots, and release archives do not belong in source control. Recreate them with the package scripts when needed.

## Development ports

Angular, Electron, Playwright, and code generation use `http://127.0.0.1:4500` in development.

## Change discipline

1. Add new behavior to the smallest relevant domain module.
2. Keep migrations idempotent and update `migrations/001_lims_schema.sql` when the runtime schema changes.
3. Run the Electron TypeScript build and Angular production build before packaging.
4. Run focused Playwright workflows for billing, collection, reporting, and rejection/recheck changes.
5. Never place one-time production data deletion or test reset logic in application startup.
