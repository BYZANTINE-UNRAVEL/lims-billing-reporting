# LIMS Professional

Offline-first laboratory billing, specimen workflow, result reporting, analyzer integration, statements, commissions, and backup management for Windows.

## Stack

- Angular 18 renderer
- Electron 33 desktop shell
- SQLite through `better-sqlite3`
- pdfmake and ExcelJS exports
- Playwright workflow tests

## Development

```bash
npm install
npm run dev
```

Angular and Electron use `http://127.0.0.1:4500` during development.

## Validation and packaging

```bash
npm run build
npm run test:e2e
npm run dist
```

`npm run build` creates the Angular and Electron output. `npm run dist` produces the Windows NSIS installer.

## Source structure

- `src/app/features`: Angular feature screens.
- `electron-main/services/database-*.service.ts`: SQLite persistence separated by core, billing, workflow, and operations domains.
- `electron-main/services/report-*.service.ts`: report configuration, layout, content, document generation, and billing exports.
- `migrations`: reviewable database schema documentation.
- `tests/e2e`: end-to-end workflow coverage.
- `docs`: architecture, maintenance, and automation guidance.

Generated builds, dependency folders, test reports, release archives, patch payloads, and temporary source snapshots are intentionally excluded from the repository.

Backup restore is available from Settings. Every restore is constrained to the configured backup folder, checked with SQLite integrity and required-schema validation, and preceded by an automatic `pre-restore` safety backup.

Test Master exposes two option-backed result controls: `Option` for strict fixed-list selection and `Search Select` for filter-then-select entry. Their report-entry behavior lives in separate engines under `src/app/features/reports/result-input`.
