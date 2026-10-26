-- 005_profiles_role_type_and_email.sql
-- 1. Create app_role enum type (viewer, editor, admin, disabled)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('viewer', 'editor', 'admin', 'disabled');
  end if;
end$$;

-- 2. Ensure profiles table exists with id, display_name, email, role, created_at
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  role public.app_role not null default 'viewer'::public.app_role,
  created_at timestamptz not null default now()
);

-- Add email column if profiles table already existed without it
alter table public.profiles add column if not exists email text;

-- Add created_at column if profiles table already existed without it
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Transition existing role column if it was text to app_role enum
do $$
begin
  -- Drop existing text check constraint if present
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'profiles' and constraint_name = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;

  -- Convert column type to app_role if it is still text
  if exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'role' and udt_name = 'text'
  ) then
    alter table public.profiles alter column role drop default;
    alter table public.profiles alter column role type public.app_role using role::public.app_role;
    alter table public.profiles alter column role set default 'viewer'::public.app_role;
  end if;
end$$;

-- Backfill email from auth.users if available
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;
