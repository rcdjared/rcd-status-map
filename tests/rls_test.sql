-- tests/rls_test.sql
-- Row Level Security (RLS) Verification Script
-- Run these tests in the Supabase SQL Editor to verify access control.

/*
================================================================================
FIRST TIME SETUP (Run once in SQL Editor with postgres role)
================================================================================
To promote your own account to admin:
  update public.profiles
  set role = 'admin'
  where email = 'YOUR_EMAIL_HERE';
(Never commit your personal email to version control)
*/

begin; -- Begin transaction for testing; rollback at the end so test data isn't persisted

-- 1. Create temporary test users in auth.users & profiles for testing
-- (Replace with existing IDs if testing directly against real accounts)
do $$
declare
  v_admin_id uuid := '11111111-1111-1111-1111-111111111111';
  v_editor_id uuid := '22222222-2222-2222-2222-222222222222';
  v_viewer_id uuid := '33333333-3333-3333-3333-333333333333';
  v_disabled_id uuid := '44444444-4444-4444-4444-444444444444';
begin
  -- Ensure test profiles exist
  insert into public.profiles (id, email, display_name, role)
  values
    (v_admin_id, 'admin@test.local', 'Admin User', 'admin'),
    (v_editor_id, 'editor@test.local', 'Editor User', 'editor'),
    (v_viewer_id, 'viewer@test.local', 'Viewer User', 'viewer'),
    (v_disabled_id, 'disabled@test.local', 'Disabled User', 'disabled')
  on conflict (id) do update set role = excluded.role;
end$$;

-- ============================================================================
-- TEST SUITE 1: VIEWER ROLE
-- ============================================================================
set local role authenticated;
set local "request.jwt.claim.sub" to '33333333-3333-3333-3333-333333333333';

-- [Viewer - Read profiles]: Should ONLY return 1 row (their own profile)
select count(*) as viewer_profile_read_count from public.profiles;

-- [Viewer - Read projects & marks]: Should succeed
select count(*) as viewer_projects_read_count from public.projects;
select count(*) as viewer_marks_read_count from public.marks;

-- [Viewer - Write marks]: Should FAIL or insert 0 rows due to RLS
-- insert into public.marks (project_id, x, y, status) values (...); -- Expect violation

-- [Viewer - Change roles]: Should FAIL
-- select public.set_user_role('22222222-2222-2222-2222-222222222222', 'admin'); -- Expect: Only administrators can change roles

-- ============================================================================
-- TEST SUITE 2: EDITOR ROLE
-- ============================================================================
set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

-- [Editor - Read profiles]: Should ONLY return 1 row (own profile)
select count(*) as editor_profile_read_count from public.profiles;

-- [Editor - Read projects & marks]: Should succeed
select count(*) as editor_projects_read_count from public.projects;

-- [Editor - Read role changes]: Should FAIL / return 0 rows
select count(*) as editor_role_changes_count from public.role_changes;

-- ============================================================================
-- TEST SUITE 3: ADMIN ROLE
-- ============================================================================
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- [Admin - Read all profiles]: Should return all active profiles
select id, email, role from public.profiles;

-- [Admin - Read role change history]: Should succeed
select count(*) as admin_role_changes_count from public.role_changes;

-- [Admin - Self change]: Must FAIL
-- select public.set_user_role('11111111-1111-1111-1111-111111111111', 'viewer'); -- Expect: Cannot change your own role

-- ============================================================================
-- TEST SUITE 4: DISABLED ROLE
-- ============================================================================
set local role authenticated;
set local "request.jwt.claim.sub" to '44444444-4444-4444-4444-444444444444';

-- [Disabled - Read projects]: Should return 0 rows (blocked)
select count(*) as disabled_projects_count from public.projects;

-- [Disabled - Read marks]: Should return 0 rows (blocked)
select count(*) as disabled_marks_count from public.marks;

rollback; -- Undo all test modifications cleanly
