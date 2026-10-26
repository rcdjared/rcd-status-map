-- 001_profiles.sql
-- Create profiles table linked to Supabase auth.users

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Policy: anyone authenticated can read all profiles
create policy "Authenticated users can view all profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Policy: users can only update their own profile
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
