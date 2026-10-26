-- 010_set_user_role_and_role_changes.sql
-- 1. Create role_changes log table
create table if not exists public.role_changes (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  old_role public.app_role not null,
  new_role public.app_role not null,
  changed_by uuid not null references public.profiles(id) on delete cascade,
  changed_at timestamptz not null default now()
);

-- Index for querying history for a user
create index if not exists idx_role_changes_target_user on public.role_changes(target_user_id);
create index if not exists idx_role_changes_changed_at on public.role_changes(changed_at desc);

-- Enable RLS on role_changes
alter table public.role_changes enable row level security;

-- Policy: only admins can view role changes
drop policy if exists "Admins can view role changes" on public.role_changes;
create policy "Admins can view role changes"
  on public.role_changes
  for select
  to authenticated
  using (public.get_caller_role() = 'admin'::public.app_role);

-- 2. Trigger to block direct updates to role column on profiles
create or replace function public.prevent_direct_role_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role then
    if current_setting('app.allow_role_change', true) is distinct from 'true' then
      raise exception 'Direct updates to role column are prohibited. Use set_user_role() instead.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_direct_role_update on public.profiles;
create trigger trg_prevent_direct_role_update
  before update of role on public.profiles
  for each row
  execute function public.prevent_direct_role_update();

-- Revoke direct update privilege on role column from authenticated and anon
revoke update (role) on public.profiles from authenticated, anon;

-- 3. set_user_role function
-- Rejects self-changes, rejects non-admins, and blocks demoting the last admin
create or replace function public.set_user_role(
  target_user_id uuid,
  new_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_role public.app_role;
  v_old_role public.app_role;
  v_admin_count int;
begin
  v_caller_id := auth.uid();

  -- Verify caller is authenticated
  if v_caller_id is null then
    raise exception 'Unauthorized: Must be logged in';
  end if;

  -- Verify caller is an admin
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is distinct from 'admin'::public.app_role then
    raise exception 'Permission denied: Only administrators can change roles';
  end if;

  -- Block self-role changes
  if v_caller_id = target_user_id then
    raise exception 'Forbidden: Cannot change your own role';
  end if;

  -- Retrieve existing role of target user
  select role into v_old_role
  from public.profiles
  where id = target_user_id;

  if v_old_role is null then
    raise exception 'User profile not found';
  end if;

  -- If role is unchanged, do nothing
  if v_old_role = new_role then
    return;
  end if;

  -- Block demoting the last admin
  if v_old_role = 'admin'::public.app_role and new_role != 'admin'::public.app_role then
    select count(*) into v_admin_count
    from public.profiles
    where role = 'admin'::public.app_role;

    if v_admin_count <= 1 then
      raise exception 'Cannot demote the last administrator';
    end if;
  end if;

  -- Allow update within this transaction
  perform set_config('app.allow_role_change', 'true', true);

  -- Update target profile role
  update public.profiles
  set role = new_role
  where id = target_user_id;

  -- Record in role_changes log
  insert into public.role_changes (
    target_user_id,
    old_role,
    new_role,
    changed_by,
    changed_at
  )
  values (
    target_user_id,
    v_old_role,
    new_role,
    v_caller_id,
    now()
  );
end;
$$;

-- Grant execute permission on set_user_role to authenticated users
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
