-- Phase 3 access rules and audit hardening verification.
-- Run only against the development Supabase project, as one SQL Editor execution.
-- Uses existing role profiles and a seeded project. Fixture writes roll back.
-- Storage object deletion is verified through its RLS policy definition because
-- Supabase blocks direct DELETE statements; use the Storage API for a manual check.

begin;

-- Admin: project management and display-name RPC.
select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (select id::text from public.profiles
     where role = 'admin'::public.app_role order by id limit 1),
    '00000000-0000-0000-0000-000000000000'
  ),
  true
);
set local role authenticated;
do $$
declare
  v_project_id uuid;
  v_deleted_project_id uuid;
  v_storage_id uuid;
  v_storage_result_id uuid;
  v_display_names bigint;
  v_result_signature text;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'admin'::public.app_role then
    raise exception 'Setup problem: no admin-role profile found';
  end if;

  insert into public.projects (name, map_url)
  values ('Phase 3 verification fixture', '/phase3-verification')
  returning id into v_project_id;
  if v_project_id is null then
    raise exception 'Admin could not create a project';
  end if;

  delete from public.projects
  where id = v_project_id
  returning id into v_deleted_project_id;
  if v_deleted_project_id is distinct from v_project_id then
    raise exception 'Admin could not delete a project';
  end if;

  select count(*) into v_display_names
  from public.get_display_names(array[auth.uid()]);
  if v_display_names <> 1 then
    raise exception 'Display-name function did not return the admin profile';
  end if;
  select pg_get_function_result('public.get_display_names(uuid[])'::regprocedure)
    into v_result_signature;
  if v_result_signature <> 'TABLE(id uuid, display_name text)' then
    raise exception 'Display-name function exposes an unexpected result: %', v_result_signature;
  end if;

  insert into storage.objects (bucket_id, name)
  values ('maps', 'phase3-verification-' || txid_current()::text)
  returning id into v_storage_id;
  if v_storage_id is null then
    raise exception 'Admin could not create a maps storage object fixture';
  end if;
  update storage.objects
  set name = name || '-admin-update'
  where id = v_storage_id
  returning id into v_storage_result_id;
  if v_storage_result_id is distinct from v_storage_id then
    raise exception 'Admin could not update a maps storage object';
  end if;
end;
$$;
reset role;

-- Editor: project configuration allowed; metadata, project management,
-- storage writes, and direct mark-history writes denied. Mark actor is server-set.
select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (select id::text from public.profiles
     where role = 'editor'::public.app_role order by id limit 1),
    '00000000-0000-0000-0000-000000000000'
  ),
  true
);
set local role authenticated;
do $$
declare
  v_project_id uuid;
  v_result_id uuid;
  v_storage_id uuid;
  v_mark_id uuid;
  v_actor uuid;
  v_display_names bigint;
  v_legend_x real;
  v_legend_y real;
  v_status_config jsonb;
  v_blocked boolean;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'editor'::public.app_role then
    raise exception 'Setup problem: no editor-role profile found';
  end if;

  select id into v_project_id
  from public.projects
  order by name, id
  limit 1;
  if v_project_id is null then
    raise exception 'Setup problem: no visible project found';
  end if;
  update public.projects
  set legend_x = 0.321,
      legend_y = 0.654,
      status_config = coalesce(status_config, '{}'::jsonb)
        || '{"phase3_test":{"n":"Phase 3 Test","c":"#123456"}}'::jsonb
  where id = v_project_id
  returning id, legend_x, legend_y, status_config
    into v_result_id, v_legend_x, v_legend_y, v_status_config;
  if v_result_id is distinct from v_project_id
    or v_legend_x is distinct from 0.321::real
    or v_legend_y is distinct from 0.654::real
    or v_status_config -> 'phase3_test' is distinct from
      '{"n":"Phase 3 Test","c":"#123456"}'::jsonb then
    raise exception 'Editor could not update legend position and status config';
  end if;

  v_blocked := false;
  begin
    update public.projects set name = name || ' blocked' where id = v_project_id;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor changed project name';
  end if;

  v_blocked := false;
  begin
    update public.projects set map_url = map_url || '?blocked' where id = v_project_id;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor changed project map URL';
  end if;

  v_blocked := false;
  begin
    update public.projects set id = gen_random_uuid() where id = v_project_id;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor changed project ID';
  end if;

  v_blocked := false;
  begin
    update public.projects
    set created_at = created_at + interval '1 second'
    where id = v_project_id;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor changed project creation timestamp';
  end if;

  v_blocked := false;
  begin
    insert into public.projects (name, map_url)
    values ('Editor project must be denied', '/phase3-denied');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor inserted a project';
  end if;

  v_result_id := null;
  delete from public.projects where id = v_project_id returning id into v_result_id;
  if v_result_id is not null then
    raise exception 'Editor deleted a project';
  end if;

  select id into v_storage_id
  from storage.objects
  where bucket_id = 'maps'
    and name = 'phase3-verification-' || txid_current()::text || '-admin-update'
  limit 1;
  if v_storage_id is null then
    raise exception 'Setup problem: admin Storage fixture is not visible to editor';
  end if;
  v_result_id := null;
  update storage.objects
  set name = name || '-editor-update'
  where id = v_storage_id
  returning id into v_result_id;
  if v_result_id is not null then
    raise exception 'Editor updated a maps storage object';
  end if;

  v_blocked := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('maps', 'phase3-editor-upload-' || gen_random_uuid()::text);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor inserted a maps storage object';
  end if;

  select count(*) into v_display_names
  from public.get_display_names(array[auth.uid()]);
  if v_display_names <> 1 then
    raise exception 'Editor could not access the display-name function';
  end if;

  insert into public.marks (project_id, x, y, status, kind, updated_by)
  values (v_project_id, 0.25, 0.25, 'phase3-before', 'pin', gen_random_uuid())
  returning id, updated_by into v_mark_id, v_actor;
  if v_actor is distinct from auth.uid() then
    raise exception 'Mark insert trusted client-supplied updated_by';
  end if;

  update public.marks
  set status = 'phase3-after', updated_by = gen_random_uuid()
  where id = v_mark_id
  returning updated_by into v_actor;
  if v_actor is distinct from auth.uid() then
    raise exception 'Mark update trusted client-supplied updated_by';
  end if;

  if not exists (
    select 1 from public.mark_history
    where mark_id = v_mark_id
      and old_status = 'phase3-before'
      and new_status = 'phase3-after'
      and changed_by = auth.uid()
  ) then
    raise exception 'Mark history trigger did not record the editor status change';
  end if;

  v_blocked := false;
  begin
    insert into public.mark_history (mark_id, old_status, new_status, changed_by)
    values (v_mark_id, 'forged-old', 'forged-new', auth.uid());
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor inserted a mark-history row directly';
  end if;
end;
$$;
reset role;

-- Viewer: can read enabled project/map data but cannot write it.
select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (select id::text from public.profiles
     where role = 'viewer'::public.app_role order by id limit 1),
    '00000000-0000-0000-0000-000000000000'
  ),
  true
);
set local role authenticated;
do $$
declare
  v_project_id uuid;
  v_result_id uuid;
  v_project_count bigint;
  v_blocked boolean;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'viewer'::public.app_role then
    raise exception 'Setup problem: no viewer-role profile found';
  end if;

  select count(*) into v_project_count from public.projects;
  if v_project_count = 0 then
    raise exception 'Viewer could not read projects';
  end if;

  select id into v_project_id from public.projects order by name, id limit 1;
  v_blocked := false;
  begin
    insert into public.projects (name, map_url)
    values ('Viewer project must be denied', '/phase3-denied');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Viewer inserted a project';
  end if;

  v_result_id := null;
  update public.projects set legend_x = 0.5 where id = v_project_id returning id into v_result_id;
  if v_result_id is not null then
    raise exception 'Viewer updated a project';
  end if;
end;
$$;
reset role;

-- Disabled: project, mark, and display-name access is denied.
select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (select id::text from public.profiles
     where role = 'disabled'::public.app_role order by id limit 1),
    '00000000-0000-0000-0000-000000000000'
  ),
  true
);
set local role authenticated;
do $$
declare
  v_count bigint;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'disabled'::public.app_role then
    raise exception 'Setup problem: no disabled-role profile found';
  end if;

  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'Disabled user can read projects';
  end if;

  select count(*) into v_count from public.marks;
  if v_count <> 0 then
    raise exception 'Disabled user can read marks';
  end if;

  select count(*) into v_count
  from public.get_display_names(array[auth.uid()]);
  if v_count <> 0 then
    raise exception 'Disabled user can use get_display_names';
  end if;
end;
$$;
reset role;

-- Supabase prevents direct SQL deletes from storage.objects. Verify the
-- admin-only DELETE policy definition here; exercise actual deletion through
-- the Storage API in the app.
do $$
declare
  v_policy_count bigint;
begin
  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Admins can delete map images'
    and cmd = 'DELETE'
    and coalesce(qual, '') ilike '%maps%'
    and coalesce(qual, '') ilike '%admin%';
  if v_policy_count <> 1 then
    raise exception 'Storage DELETE policy is missing or is not admin/maps scoped';
  end if;
  raise notice 'PASS: Storage DELETE policy is admin/maps scoped';
end;
$$;

rollback;

select 'PASS: Phase 3 access rules and audit hardening verified' as verification_result;
