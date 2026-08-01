# LIMS Professional Architecture

## Goal

A reliable local desktop LIMS for billing and report preparation without analyzer integration.

## Runtime Architecture

```text
Angular UI
  -> window.limsApi preload bridge
  -> Electron IPC handlers
  -> DatabaseService / ReportService / BackupService
  -> SQLite + generated PDF/Excel files
```

## Key Design Principles

- Offline-first local operation
- SQLite WAL mode for reliability
- Typed Electron preload API; renderer has no Node access
- Database writes wrapped in transactions for critical flows
- Bill creation automatically creates report shell and receipt
- Report typing is restricted to billed tests/profile tests
- Configurable auto-backups using SQLite backup API, plus integrity-checked restore with a pre-restore safety snapshot

## Module Breakdown

### Angular Renderer

Single-shell UX inspired by the reference app:

- Left sidebar navigation
- Dark/light UI
- Dashboard cards
- Dense data tables
- Master forms
- Billing workspace
- Report typing workspace
- Settings and backup workspace

### Electron Main

Owns trusted access to:

- SQLite database
- filesystem paths
- PDF and Excel generation
- backup creation
- opening generated files

### SQLite Schema

Major tables:

- settings
- departments
- units
- tests
- profiles
- profile_tests
- patients
- consultants
- consultant_commissions
- bills
- bill_items
- receipts
- reports
- report_items
- audit_logs

## Reliability Features

- WAL journaling
- Foreign keys enabled
- Transactional bill creation
- Transactional profile save
- Transactional report item update
- Audit trail for key actions
- Manual and scheduled backups
- Configurable backup path
