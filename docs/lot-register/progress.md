# Lot Register v2 progress

Track the v2 roadmap by phase. A phase is not complete solely because SQL from
the previous attempt ran successfully; database and code evidence must match
the v2 phase sequence.

## Progress tracker

| Phase | Name | Dev DB | Prod DB | PR merged |
|-------|------|:------:|:-------:|:---------:|
| 0 | Safety net | n/a | n/a | [ ] |
| 1 | Mark integrity | n/a | n/a | [ ] |
| 2 | Persistent undo | n/a | n/a | [ ] |
| 3 | Access rules and hardening | [ ] | [ ] | [ ] |
| 4 | Register schema | [x] | [ ] | [ ] |
| 5 | Register API | [x] | [ ] | [ ] |
| 6 | Side panel form | [x] | [ ] | [ ] |
| 7 | Table view | n/a | n/a | [ ] |
| 8 | Summary and export | n/a | n/a | [ ] |
| 9 | Description templates | [ ] | [ ] | [ ] |
| 10 | Register history and retention | [ ] | [ ] | [ ] |
| 11 | CSV import | [ ] | [ ] | [ ] |
| 12 | Docs and release | n/a | n/a | [ ] |

## Decisions

- Keep this log brief: record milestones, validation, and blockers only.
- After each substantial change, provide a suggested commit message.
- Do not import production data into dev; use seeded projects and test data.
  Keep production exports as backups.

## Roadmap revision — 2026-11-01

- Phase 7 remains in progress; Phase 8 (Summary and export) is next.
- Reporting remains Phases 8–9. Audit and release are now Phases 10–12:
  History, CSV import, and Docs/tests/release.
- Power features (speed tools, unlabeled/unmapped indicators, and PBL map
  labels) are deferred until after Phase 12 and are not release prerequisites.

## Execution log

### Phase 0 — Safety net (in progress)

- Work is on `feature/v2`; the previous attempt is archived locally as
  `archive/lot-register-attempt-1` and was not merged.
- User reports old Lot Register SQL was applied to production. Do not rerun or
  remove production objects before exporting and inspecting affected data.
- Repository safety files and CI updates are in place. Typecheck, lint, build,
  and `git diff --check` passed; build has the existing large-chunk warning.
- User reports dev migrations ran and four accounts were created with roles
  assigned. Exact role counts and seeded projects still need read-only
  confirmation.
- User reports production exports saved for `projects`, `marks`, `profiles`,
  `role_changes`, and mark history (`mar_history` in their message), and says
  `lot_register` is empty. These results have not been independently verified.
- Added a read-only production inspection query. Review its output before
  considering any production cleanup. No database changes have been made by
  this work.
- Remaining: verify dev setup; review production inspection results; create
  GitHub milestones/issues.

### Phase 1 — Mark integrity (implementation in progress)

- Repaint now updates the newest overlapping fill in place; erase, duplicate
  removal, and clear wait for Supabase and report failures.
- Added admin-only duplicate dry-run/confirm UI. Authenticated loads treat
  Supabase as authoritative, including empty results; they do not restore stale
  local marks when the remote project cannot be loaded.
- `npm test` (3 tests), typecheck, lint, build, and `git diff --check` pass.
  Build retains the existing large-chunk warning.
- User reports dev manual checks passed: repaint identity/history, overlap
  handling, dry-run preview, confirmed cleanup, erase, and Clear.
- No migration or database change was made. Production dry-run across all six
  projects and PR/CI merge remain outstanding.
- Removed automatic migration deployment on pushes to `main`; production
  migration workflow now requires a manual dispatch with explicit confirmation.

### Phase 2 — Persistent undo (dev manual checks reported passing)

- Replaced mark snapshots with inverse actions for add, erase, status change,
  and legend position. Clear intentionally clears undo history and explains
  that it cannot be safely undone.
- Status undo checks the latest audit event and conditionally updates only if
  the mark still has the status this user changed. No database changes made.
- `npm test` (4 tests), typecheck, lint, build, and `git diff --check` pass;
  build retains the existing large-chunk warning.
- User reports two-browser add/erase/status undo, reload persistence, and
  conflict refusal all passed.

### Phase 3 — Access rules (dev verified; production pending)

- UI/API review: editors and admins update `projects.legend_x`,
  `projects.legend_y`, and `projects.status_config`; admins create projects
  (`name`, `map_url`, initial legend coordinates) and delete projects. Map
  uploads write to the `maps` Storage bucket and are admin-only in the UI.
- User confirmed this inventory and reports migration 013 applied in dev.
  Corrected denied-RLS assertions and removed direct Storage DELETE SQL; the
  script checks the admin-scoped policy instead. Replaced its temporary
  Storage fixture with a transaction-named object. User reports the corrected
  verification passed.
- Do not apply to production until migration history is reconciled.
- Mark history remains cascade-deleted with its mark as before: mark deletion
  can remove its audit trail, preserving existing behavior but limiting audit
  retention for deleted marks.

### Phase 4 — Register schema (dev verified; production pending)

- Added migration 014 and rollback-only role tests. The schema allows one row
  per normalized project/phase/block/lot and at most one register row per mark.
- Added same-project enforcement between a lot row and its linked mark; this
  prevents direct API writes or project changes from creating cross-project
  links, a case not covered in the original roadmap.
- Status is intentionally free text; category changes must not invalidate
  existing register data. Insert timestamps and actor fields are server-set.
- Removed temporary-table dependence from the verification script after the
  SQL Editor issue in Phase 3.
- User reports: `PASS: Phase 4 lot_register schema verified; all fixtures rolled back.`
  Development verification is recorded as passed; production application and
  PR merge remain outstanding. This report does not independently confirm
  production state.

### Phase 5 — Register API and atomic save (dev verified; production pending)

- Added migration 015 with invoker-rights RPCs for atomic register/mark saves
  and status updates, plus typed client API and rollback-only verification SQL.
- Duplicate-PBL database errors map to `DuplicatePblError` with the conflicting
  row ID.
- `npm run build`, `npm run lint`, `npm test` (4 tests), and `git diff --check`
  pass. The SQL verification was not run locally; PostgreSQL tooling and a live
  database connection are unavailable in this workspace.
- User reports: `PASS: save, edit, link, conflict ID, and atomic status mirroring; fixtures rolled back.`
- Dev verification is recorded as passed. Production application and PR merge
  remain outstanding.

### Phase 6 — Side panel form (dev verified; production pending)

- Added migration 016 and a rollback-only undo test, plus the lot side panel,
  sticky fields, duplicate guidance/highlight, paint integration, and 5-second
  status undo action.
- User reports: `PASS: linked lot status undo is atomic; fixtures rolled back.`
  The Phase 6 database undo verification is recorded as passed.
- User confirms Phase 6 manual checks passed. The side panel, duplicate
  correction/highlight, sticky fields, repaint, and Undo are recorded as
  verified; production application and PR merge remain outstanding.
- `npm run build`, `npm run lint`, `npm test` (4 tests), and `git diff --check`
  pass; build retains the existing large-chunk warning.

### Phase 7 — Table view (implementation in progress)

- Added a live register drawer with combined phase/block/status filters, PBL
  search, natural sorting, status chips, inline editor/admin status updates,
  row-to-map highlighting, and project-scoped realtime updates.
- Kept a normal DOM table without virtualization for the roadmap's ~2,000-row
  scale; performance has not yet been measured with a populated 2,000-row set.
- `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` (5 tests),
  and `git diff --check` pass. Build retains the existing large-chunk warning.
- Browser verification was not run because the local Playwright Chromium
  executable is unavailable. Two-browser realtime and project-switch checks
  remain pending.

### Phase 7 — Table follow-up

- User confirmed erased map fills should keep their register data. Erasing now
  refreshes the register immediately, identifies preserved rows as `Unmapped`,
  and notifies the editor that the register entry was retained.
- Editors and admins can now edit Phase/Block/Lot values and delete individual
  register entries from the table. Deleting a linked entry leaves its map fill
  in place; duplicate PBL values and blank fields are reported.
- Opening a new painted lot's PBL form closes the register table so it cannot
  cover the inputs. Cancel, close, or Escape removes the newly painted fill if
  it has not been registered; saved lots and pre-existing fills are preserved.
- Reorganized the header into project/map-management and status controls, with
  all map tools and view actions grouped together in one toolbar.
- Build, typecheck, lint, five tests, and `git diff --check` pass. Browser
  inspection reached the sign-in screen; authenticated table actions and the
  signed-in header still need manual verification. Two-browser realtime and
  project-switch checks remain pending.

### Phase 8 — Summary and export (implemented locally)

- Added live lot summary cards for visible rows, including totals, mapped, and
  unmapped counts.
- Added CSV export with UTF-8 BOM and formula-injection neutralization for cells
  beginning with `=`, `+`, `-`, or `@`.
- Added XLSX export with `Lots` and `Summary` worksheets through a dynamic
  `import('xlsx')` so the workbook code is split out of the main bundle.
- Added focused unit coverage for summary totals and CSV escaping; `npm test`
  and `npm run build` pass.

### Phase 9 — Description templates (implementation in progress)

- Added the whitelist-based template engine for lot and summary descriptions,
  with built-in defaults and explicit warnings for unknown placeholders instead
  of silent drops.
- Added range collapsing for `lot_list` values so simple lists tighten to
  compact ranges such as `1-3, 5-6, 9`.
- CSV exports now start with a summary block showing project, local export
  date, total/mapped/unmapped lots, and per-status description lines rendered
  from the built-in summary template. The lot-detail header and rows follow.
- Added unit coverage for built-in rendering, placeholder validation, and
  range formatting; CSV summary output is also covered. Template rendering
  remains pure and safe from code execution.
- Remaining: custom template storage, template picker/editor controls, and
  copy-to-clipboard action in the lot register UI and project context.
- Suggested commit message: `feat: add description templates and CSV summary`
