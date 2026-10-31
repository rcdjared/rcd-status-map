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
| 4 | Register schema | [ ] | [ ] | [ ] |
| 5 | Register API | [ ] | [ ] | [ ] |
| 6 | Side panel form | n/a | n/a | [ ] |
| 7 | Table view | n/a | n/a | [ ] |
| 8 | Summary and export | n/a | n/a | [ ] |
| 9 | Description templates | [ ] | [ ] | [ ] |
| 10 | Speed tools | [ ] | [ ] | [ ] |
| 11 | Unlabeled and unmapped indicator | n/a | n/a | [ ] |
| 12 | PBL map labels | n/a | n/a | [ ] |
| 13 | Register history and retention | [ ] | [ ] | [ ] |
| 14 | CSV import | [ ] | [ ] | [ ] |
| 15 | Docs and release | n/a | n/a | [ ] |

## Decisions

- Keep this log brief: record milestones, validation, and blockers only.
- After each substantial change, provide a suggested commit message.
- Do not import production data into dev; use seeded projects and test data.
  Keep production exports as backups.

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

### Phase 4 — Register schema (drafted; dev application pending)

- Added migration 014 and rollback-only role tests. The schema allows one row
  per normalized project/phase/block/lot and at most one register row per mark.
- Added same-project enforcement between a lot row and its linked mark; this
  prevents direct API writes or project changes from creating cross-project
  links, a case not covered in the original roadmap.
- Status is intentionally free text; category changes must not invalidate
  existing register data. Insert timestamps and actor fields are server-set.
- Removed temporary-table dependence from the verification script after the
  SQL Editor issue in Phase 3. Not applied to a database; rebuild dev through
  migration 014, run its verification, and inspect expected objects before
  starting Phase 5.
