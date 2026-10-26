-- 008_profiles_rls.sql
-- Update Row Level Security on profiles:
-- 1. Users can read their own row, and admins can read all rows.
-- 2. Users can only update their own row (display_name).

alter table public.profiles enable row level security;

-- Drop previous policies
drop policy if exists "Authenticated users can view all profiles" on public.profiles;
drop policy if exists "Users read own profile or admins read all profiles" on public.profiles;
drop policy if exists "Users can read own profile or admins read all" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

-- Select policy: users read own row, admins read all
create policy "Users can read own profile or admins read all"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or public.get_caller_role() = 'admin'::public.app_role
  );

-- Update policy: users can update their own profile
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
