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

## Execution log

### Phase 0 — Safety net (in progress)

- Work is on `feature/v2`; the previous attempt is archived locally as
  `archive/lot-register-attempt-1` and was not merged.
- User reports old Lot Register SQL was applied to production. Do not rerun or
  remove production objects before exporting and inspecting affected data.
- Repository safety files and CI updates are in place. Typecheck, lint, build,
  and `git diff --check` passed; build has the existing large-chunk warning.
- User reports the new dev project has migrations run and four test accounts
  created. Roles and seeded projects still need read-only confirmation.
- Remaining: verify dev setup; export/inspect production data; create GitHub
  milestones/issues. No database changes have been made by this work.
