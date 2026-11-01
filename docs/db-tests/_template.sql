-- Copy this pattern into a phase-specific database verification script.
-- Run against the dev Supabase project first. Never hardcode user/project IDs.
-- Each test should use its own transaction and roll back all fixture changes.

begin;

select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (
      select id::text
      from public.profiles
      where role = 'editor'::public.app_role
      order by id
      limit 1
    ),
    '00000000-0000-0000-0000-000000000000'
  ),
  true
);

set local role authenticated;

do $$
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'editor'::public.app_role then
    raise exception 'Setup problem: no editor-role profile found';
  end if;

  -- Assertions go here. Raise an exception on failure.
  -- Use RAISE NOTICE 'PASS: ...' for successful checks.
end;
$$;

rollback;
