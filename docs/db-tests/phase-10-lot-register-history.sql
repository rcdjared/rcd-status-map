-- Phase 10: lot register history, access control, restore, and retention.
-- Run against the dev Supabase project after migrations 001-017 are applied.
-- This transaction rolls back its project, marks, and generated history.

begin;

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
  v_admin_id uuid := auth.uid();
  v_editor_id uuid;
  v_viewer_id uuid;
  v_project_id uuid;
  v_mark_id uuid;
  v_lot_id uuid;
  v_history_id uuid;
  v_count_before bigint;
  v_count_after bigint;
  v_blocked boolean;
  v_status text;
begin
  if v_admin_id is null
    or public.get_caller_role() is distinct from 'admin'::public.app_role then
    raise exception 'Setup problem: no admin-role profile found';
  end if;

  select id into v_editor_id
  from public.profiles
  where role = 'editor'::public.app_role
  order by id
  limit 1;
  select id into v_viewer_id
  from public.profiles
  where role = 'viewer'::public.app_role
  order by id
  limit 1;
  if v_editor_id is null or v_viewer_id is null then
    raise exception 'Setup problem: editor and viewer test profiles are required';
  end if;

  insert into public.projects (name, map_url)
  values ('Phase 10 history fixture', '/phase10-history-' || txid_current()::text)
  returning id into v_project_id;
  insert into public.marks (project_id, x, y, status, kind)
  values (v_project_id, 0.1, 0.1, 'available', 'fill')
  returning id into v_mark_id;

  select id into v_lot_id
  from public.save_lot(v_project_id, v_mark_id, 'P1', 'B1', 'LOT 1', 'available');
  select count(*) into v_count_after
  from public.lot_register_history
  where register_id = v_lot_id and action = 'INSERT';
  if v_count_after <> 1 then
    raise exception 'Insert did not write exactly one history entry';
  end if;

  select count(*) into v_count_before
  from public.lot_register_history where register_id = v_lot_id;
  perform public.save_lot(v_project_id, v_mark_id, 'P1', 'B1', 'LOT 1', 'available');
  select count(*) into v_count_after
  from public.lot_register_history where register_id = v_lot_id;
  if v_count_after <> v_count_before then
    raise exception 'No-change save unexpectedly wrote a history entry';
  end if;

  perform set_config('request.jwt.claim.sub', v_editor_id::text, true);
  update public.lot_register
  set phase = 'P2', block = 'B1', lot = 'LOT 1'
  where id = v_lot_id;
  select id into v_history_id
  from public.lot_register_history
  where register_id = v_lot_id
    and action = 'UPDATE'
    and new_values ? 'phase'
  order by changed_at desc, id desc
  limit 1;
  if v_history_id is null
    or (select old_values from public.lot_register_history where id = v_history_id)
      <> '{"phase":"P1"}'::jsonb
    or (select new_values from public.lot_register_history where id = v_history_id)
      <> '{"phase":"P2"}'::jsonb then
    raise exception 'Update history did not store only the changed field values';
  end if;

  perform public.update_lot_status(v_lot_id, 'reserved');
  select status into v_status from public.marks where id = v_mark_id;
  if v_status is distinct from 'reserved' then
    raise exception 'Lot status update did not mirror the linked mark';
  end if;

  perform public.restore_lot_register_history(v_history_id);
  if not exists (
    select 1 from public.lot_register
    where id = v_lot_id and phase = 'P1' and status = 'reserved'
  ) then
    raise exception 'Restore did not apply previous values without reverting unrelated fields';
  end if;
  if not exists (
    select 1 from public.lot_register_history
    where register_id = v_lot_id
      and action = 'UPDATE'
      and changed_by = v_editor_id
      and new_values ? 'phase'
      and new_values->>'phase' = 'P1'
  ) then
    raise exception 'Restore did not create a new history entry';
  end if;

  v_blocked := false;
  begin
    update public.lot_register_history
    set action = 'DELETE'
    where id = v_history_id;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor unexpectedly updated append-only history';
  end if;

  v_blocked := false;
  begin
    delete from public.lot_register_history where id = v_history_id;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor unexpectedly deleted append-only history';
  end if;

  perform set_config('request.jwt.claim.sub', v_viewer_id::text, true);
  if exists (select 1 from public.lot_register_history where register_id = v_lot_id) then
    raise exception 'Viewer unexpectedly read editor/admin-only lot history';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  delete from public.lot_register where id = v_lot_id;
  if not exists (
    select 1 from public.lot_register_history
    where register_id = v_lot_id and action = 'DELETE'
  ) then
    raise exception 'Delete did not write history or history was cascade-deleted';
  end if;

  perform set_config('app.phase10.project_id', v_project_id::text, true);
  perform set_config('app.phase10.admin_id', v_admin_id::text, true);
  perform set_config('app.phase10.editor_id', v_editor_id::text, true);
  raise notice 'PASS: Phase 10 history, access, restore, and retention checks passed';
end;
$$;

reset role;

with old_row as (
  insert into public.lot_register_history (
    register_id, project_id, action, old_values, changed_at
  ) values (
    gen_random_uuid(),
    current_setting('app.phase10.project_id')::uuid,
    'DELETE',
    '{}'::jsonb,
    now() - interval '20 months'
  )
  returning id
)
select set_config('app.phase10.old_history_id', id::text, true) from old_row;

with recent_row as (
  insert into public.lot_register_history (
    register_id, project_id, action, old_values, changed_at
  ) values (
    gen_random_uuid(),
    current_setting('app.phase10.project_id')::uuid,
    'DELETE',
    '{}'::jsonb,
    now()
  )
  returning id
)
select set_config('app.phase10.recent_history_id', id::text, true) from recent_row;

select set_config(
  'request.jwt.claim.sub',
  current_setting('app.phase10.admin_id'),
  true
);
set local role authenticated;

do $$
declare
  v_deleted bigint;
  v_blocked boolean := false;
begin
  v_deleted := public.purge_lot_history(interval '18 months');
  if v_deleted < 1
    or exists (
      select 1 from public.lot_register_history
      where id = current_setting('app.phase10.old_history_id')::uuid
    )
    or not exists (
      select 1 from public.lot_register_history
      where id = current_setting('app.phase10.recent_history_id')::uuid
    ) then
    raise exception 'Retention purge did not remove only rows older than the retention window';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    current_setting('app.phase10.editor_id'),
    true
  );
  begin
    perform public.purge_lot_history(interval '18 months');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Editor unexpectedly executed history retention purge';
  end if;
  raise notice 'PASS: History retention purges only expired rows and is admin-only';
end;
$$;

rollback;

select 'PASS: Phase 10 history fixtures rolled back.' as verification_result;
