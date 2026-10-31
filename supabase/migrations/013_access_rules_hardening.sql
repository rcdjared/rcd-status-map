-- 013_access_rules_hardening.sql
-- Enforce admin-only project/map management and authoritative mark metadata.

begin;

-- Only administrators may create or delete projects. Editors retain project
-- updates for legend placement and status configuration.
drop policy if exists "Admins can insert projects" on public.projects;
drop policy if exists "Editors and admins can insert projects" on public.projects;
drop policy if exists "Admins can delete projects" on public.projects;
drop policy if exists "Editors and admins can delete projects" on public.projects;
drop policy if exists "Admins can update projects" on public.projects;
drop policy if exists "Editors and admins can update projects" on public.projects;

create policy "Admins can insert projects"
  on public.projects
  for insert
  to authenticated
  with check (public.get_caller_role() = 'admin'::public.app_role);

create policy "Editors and admins can update project configuration"
  on public.projects
  for update
  to authenticated
  using (
    public.get_caller_role() in (
      'editor'::public.app_role,
      'admin'::public.app_role
    )
  )
  with check (
    public.get_caller_role() in (
      'editor'::public.app_role,
      'admin'::public.app_role
    )
  );

create policy "Admins can delete projects"
  on public.projects
  for delete
  to authenticated
  using (public.get_caller_role() = 'admin'::public.app_role);

create or replace function public.prevent_non_admin_project_metadata_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
    and public.get_caller_role() is distinct from 'admin'::public.app_role
    and (
      old.id is distinct from new.id
      or old.name is distinct from new.name
      or old.map_url is distinct from new.map_url
      or old.created_at is distinct from new.created_at
    ) then
    raise exception 'Only administrators can change project metadata'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_admin_metadata_only on public.projects;
create trigger projects_admin_metadata_only
  before update on public.projects
  for each row
  execute function public.prevent_non_admin_project_metadata_change();

-- Storage upsert needs both INSERT and UPDATE permission. Restrict both to
-- administrators while preserving the existing public-read and admin-delete rules.
drop policy if exists "Admins can upload map images" on storage.objects;
drop policy if exists "Editors and admins can upload map images" on storage.objects;
create policy "Admins can upload map images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'maps'
    and public.get_caller_role() = 'admin'::public.app_role
  );

drop policy if exists "Admins can update map images" on storage.objects;
drop policy if exists "Editors and admins can update map images" on storage.objects;
create policy "Admins can update map images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'maps'
    and public.get_caller_role() = 'admin'::public.app_role
  )
  with check (
    bucket_id = 'maps'
    and public.get_caller_role() = 'admin'::public.app_role
  );

drop policy if exists "Admins can delete map images" on storage.objects;
create policy "Admins can delete map images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'maps'
    and public.get_caller_role() = 'admin'::public.app_role
  );

-- The client cannot choose the actor or timestamp recorded for a mark.
create or replace function public.set_mark_actor_and_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marks_set_actor_and_timestamp on public.marks;
create trigger marks_set_actor_and_timestamp
  before insert or update on public.marks
  for each row
  execute function public.set_mark_actor_and_timestamp();

-- Mark history is written by the existing SECURITY DEFINER audit trigger.
drop policy if exists "Editors and admins can insert mark history" on public.mark_history;

-- Expose only display names needed by editors; never expose profile email or role.
create or replace function public.get_display_names(p_profile_ids uuid[])
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name
  from public.profiles p
  where p.id = any(coalesce(p_profile_ids, '{}'::uuid[]))
    and auth.uid() is not null
    and public.get_caller_role() in (
      'viewer'::public.app_role,
      'editor'::public.app_role,
      'admin'::public.app_role
    );
$$;

revoke all on function public.get_display_names(uuid[]) from public, anon;
grant execute on function public.get_display_names(uuid[]) to authenticated;

commit;
