# Supabase database verification

Run phase-specific SQL verification scripts in the Supabase SQL Editor, using
the **development project** first. Select and run the complete script unless
its instructions explicitly say otherwise. Do not run a filename as SQL.

Each test should:

1. Start a transaction.
2. Select a test identity dynamically from `public.profiles` by role.
3. Use `SET LOCAL ROLE authenticated`.
4. Assert expected behavior and raise an exception on failure.
5. Roll back fixture data.

Use `IS DISTINCT FROM` for role assertions so missing profiles fail loudly.
Never paste or hardcode profile/project UUIDs. A successful `RAISE NOTICE` or
final verification result should be captured before recording a test as passed.

## Required development test accounts

Create and retain one test account for each role:

- `admin`
- `editor`
- `viewer`
- `disabled`

New accounts may default to `viewer`. Assign other roles through the app's
administrator user-management flow so role-change controls and audit logging
are exercised. Do not bypass the role-change trigger with direct SQL updates.

Do not run cleanup or destructive verification against production. Before
production changes, export the affected data, apply migrations only after the
phase is merged, and record the date, environment, and result in
`docs/lot-register/progress.md`.

Use [`_template.sql`](./_template.sql) as the starting pattern for phase tests.

Phase-specific Lot Register verification scripts:

- [`phase-4-lot-register.sql`](./phase-4-lot-register.sql)
- [`phase-5-lot-register-api.sql`](./phase-5-lot-register-api.sql)
- [`phase-6-lot-register-undo.sql`](./phase-6-lot-register-undo.sql)
- [`phase-10-lot-register-history.sql`](./phase-10-lot-register-history.sql)

The Phase 10 test requires admin, editor, and viewer accounts. It verifies
history writes and field diffs, no-op saves, restore behavior, read/write
permissions, and retention. Run it in dev after applying migrations through
017; do not treat a successful local build as database verification.
