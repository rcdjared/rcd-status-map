-- 007_helper_get_caller_role.sql
-- Helper function that returns the caller's role from profiles table.
-- Used across RLS policies to enforce clean, role-based authorization without recursion.

create or replace function public.get_caller_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid();
$$;

-- Grant execution permission to authenticated and anon users
grant execute on function public.get_caller_role() to authenticated, anon;
