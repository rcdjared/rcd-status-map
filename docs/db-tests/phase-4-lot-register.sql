-- Phase 4: lot_register schema verification.
-- Run only against dev, after migrations 001-014 are applied.
-- All fixtures are created in one transaction and rolled back at the end.

begin;

-- Admin: fixtures, normalization, constraints, metadata, and CRUD.
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
  v_project_one uuid;
  v_project_two uuid;
  v_lot_id uuid;
  v_deleted_id uuid;
  v_spoof_id uuid;
  v_created_by uuid;
  v_updated_by uuid;
  v_created_at timestamptz;
  v_updated_at timestamptz;
  v_phase text;
  v_block text;
  v_lot text;
  v_status text;
  v_blocked boolean;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'admin'::public.app_role then
    raise exception 'Setup problem: no admin-role profile found';
  end if;

  select id into v_spoof_id from public.profiles
  where id <> auth.uid()
  order by id limit 1;
  if v_spoof_id is null then
    raise exception 'Setup problem: a second profile is required for metadata tests';
  end if;

  insert into public.projects (name, map_url)
  values ('Phase 4 fixture one', '/phase4-fixture-one-' || txid_current()::text)
  returning id into v_project_one;
  insert into public.projects (name, map_url)
  values ('Phase 4 fixture two', '/phase4-fixture-two-' || txid_current()::text)
  returning id into v_project_two;

  insert into public.lot_register (
    project_id, phase, block, lot, status, created_by, updated_by,
    created_at, updated_at
  )
  values (
    v_project_one, E' \t p1 \n', ' b2 ', ' lot 01 ', 'custom free-text status',
    v_spoof_id, v_spoof_id, '2000-01-01 UTC', '2000-01-01 UTC'
  )
  returning id, phase, block, lot, status, created_by, updated_by, created_at, updated_at
    into v_lot_id, v_phase, v_block, v_lot, v_status, v_created_by, v_updated_by,
      v_created_at, v_updated_at;
  if v_phase <> 'P1' or v_block <> 'B2' or v_lot <> 'LOT 01' then
    raise exception 'PBL fields were not trimmed and uppercased';
  end if;
  if v_status <> 'custom free-text status' then
    raise exception 'Register status was unexpectedly constrained';
  end if;
  if v_created_by is distinct from auth.uid()
    or v_updated_by is distinct from auth.uid() then
    raise exception 'Register insert did not replace client-supplied actor metadata';
  end if;
  if v_created_at <= '2000-01-01 UTC'::timestamptz
    or v_updated_at <= '2000-01-01 UTC'::timestamptz then
    raise exception 'Register insert trusted client-supplied timestamps';
  end if;
  v_blocked := false;
  begin
    insert into public.lot_register (project_id, phase, block, lot, status)
    values (v_project_one, 'p1', 'B2', 'LOT 01', 'duplicate');
  exception when unique_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Duplicate PBL in the same project was accepted';
  end if;

  insert into public.lot_register (project_id, phase, block, lot, status)
  values (v_project_two, 'p1', 'B2', 'LOT 01', 'same PBL in another project');
  if not exists (
    select 1 from public.lot_register
    where project_id = v_project_two and phase = 'P1' and block = 'B2' and lot = 'LOT 01'
  ) then
    raise exception 'Same PBL in another project was not accepted';
  end if;

  update public.lot_register
  set status = 'admin updated custom text'
  where project_id = v_project_one
    and phase = 'P1' and block = 'B2' and lot = 'LOT 01'
  returning status, updated_by into v_status, v_updated_by;
  if v_status <> 'admin updated custom text'
    or v_updated_by is distinct from auth.uid() then
    raise exception 'Admin could not update a register row';
  end if;

  v_blocked := false;
  begin
    insert into public.lot_register (project_id, phase, block, lot, status)
    values (v_project_one, E' \t\n ', 'B2', 'LOT 02', 'blank phase');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Blank PBL component was accepted';
  end if;

  v_blocked := false;
  begin
    insert into public.lot_register (project_id, phase, block, lot, status)
    values (v_project_one, 'P1', E' \t\n ', 'LOT 02', 'blank block');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Blank block was accepted';
  end if;

  v_blocked := false;
  begin
    insert into public.lot_register (project_id, phase, block, lot, status)
    values (v_project_one, 'P1', 'B2', E' \t\n ', 'blank lot');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Blank lot was accepted';
  end if;

  insert into public.lot_register (project_id, phase, block, lot, status)
  values (v_project_one, 'P1', 'B2', 'ADMIN DELETE', 'temporary')
  returning id into v_lot_id;
  delete from public.lot_register where id = v_lot_id returning id into v_deleted_id;
  if v_deleted_id is distinct from v_lot_id then
    raise exception 'Admin could not delete a register row';
  end if;
  raise notice 'PASS: admin CRUD, normalization, uniqueness, blank checks, and server metadata';
end;
$$;
reset role;

-- Editor: CRUD, server metadata, and mark deletion with register link preserved.
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
  v_other_project_id uuid;
  v_lot_id uuid;
  v_deleted_id uuid;
  v_mark_id uuid;
  v_actor uuid;
  v_created_by uuid;
  v_created_at timestamptz;
  v_original_created_at timestamptz;
  v_updated_at timestamptz;
  v_phase text;
  v_block text;
  v_lot text;
  v_status text;
  v_blocked boolean;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'editor'::public.app_role then
    raise exception 'Setup problem: no editor-role profile found';
  end if;

  select id into v_project_id
  from public.projects
  where map_url = '/phase4-fixture-one-' || txid_current()::text;
  select id into v_other_project_id
  from public.projects
  where map_url = '/phase4-fixture-two-' || txid_current()::text;
  if v_project_id is null then
    raise exception 'Setup problem: admin fixture projects are missing';
  end if;
  if v_other_project_id is null then
    raise exception 'Setup problem: second admin fixture project is missing';
  end if;

  insert into public.lot_register (project_id, phase, block, lot, status)
  values (v_project_id, 'p3', 'b1', 'editor 01', 'available')
  returning id, created_by, created_at into v_lot_id, v_created_by, v_created_at;
  if v_created_by is distinct from auth.uid() then
    raise exception 'Register insert did not set created_by to the editor';
  end if;
  v_original_created_at := v_created_at;
  update public.lot_register
  set phase = ' p3 ',
      block = ' b1 ',
      lot = ' editor 01 ',
      status = 'reserved',
      created_by = gen_random_uuid(),
      created_at = '2000-01-01 UTC',
      updated_by = gen_random_uuid(),
      updated_at = '2000-01-01 UTC'
  where id = v_lot_id
  returning phase, block, lot, status, updated_by, created_by,
    created_at, updated_at
    into v_phase, v_block, v_lot, v_status, v_actor, v_created_by,
      v_created_at, v_updated_at;
  if v_status <> 'reserved' or v_actor is distinct from auth.uid() then
    raise exception 'Editor could not update a register row or actor metadata';
  end if;
  if v_phase <> 'P3' or v_block <> 'B1' or v_lot <> 'EDITOR 01' then
    raise exception 'PBL fields were not normalized on update';
  end if;
  if v_created_by is distinct from auth.uid()
    or v_created_at is distinct from v_original_created_at
    or v_updated_at <= '2000-01-01 UTC'::timestamptz then
    raise exception 'Register update trusted client-supplied metadata';
  end if;

  insert into public.lot_register (project_id, phase, block, lot, status)
  values (v_project_id, 'p3', 'b1', 'editor delete', 'temporary')
  returning id into v_lot_id;
  delete from public.lot_register where id = v_lot_id returning id into v_deleted_id;
  if v_deleted_id is distinct from v_lot_id then
    raise exception 'Editor could not delete a register row';
  end if;

  insert into public.marks (project_id, x, y, status, kind)
  values (v_project_id, 0.25, 0.25, 'available', 'fill')
  returning id into v_mark_id;
  insert into public.lot_register (project_id, mark_id, phase, block, lot, status)
  values (v_project_id, v_mark_id, 'p3', 'b1', 'linked 01', 'available')
  returning id into v_lot_id;
  v_blocked := false;
  begin
    insert into public.lot_register (project_id, mark_id, phase, block, lot, status)
    values (v_project_id, v_mark_id, 'p3', 'b1', 'linked duplicate', 'available');
  exception when unique_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'A mark was linked to more than one register row';
  end if;

  v_blocked := false;
  begin
    insert into public.lot_register (project_id, mark_id, phase, block, lot, status)
    values (v_other_project_id, v_mark_id, 'p3', 'b1', 'cross project', 'available');
  exception when foreign_key_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'A mark was linked to a register row in another project';
  end if;

  v_blocked := false;
  begin
    update public.marks
    set project_id = v_other_project_id
    where id = v_mark_id;
  exception when foreign_key_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'A register-linked mark was moved to another project';
  end if;
  delete from public.marks where id = v_mark_id returning id into v_deleted_id;
  if v_deleted_id is distinct from v_mark_id then
    raise exception 'Editor could not delete the fixture mark';
  end if;
  if not exists (
    select 1 from public.lot_register
    where id = v_lot_id and mark_id is null
  ) then
    raise exception 'Deleting a mark did not preserve the register row with mark_id null';
  end if;
  raise notice 'PASS: editor CRUD, metadata, and mark unlink behavior';
end;
$$;
reset role;

-- Viewer: can read but cannot insert, update, or delete.
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
  v_lot_id uuid;
  v_result_id uuid;
  v_count bigint;
  v_blocked boolean;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'viewer'::public.app_role then
    raise exception 'Setup problem: no viewer-role profile found';
  end if;

  select count(*) into v_count from public.lot_register;
  if v_count < 2 then
    raise exception 'Viewer could not read register rows';
  end if;
  select p.id, l.id into v_project_id, v_lot_id
  from public.projects p
  join public.lot_register l on l.project_id = p.id
  where p.map_url = '/phase4-fixture-one-' || txid_current()::text
    and l.phase = 'P1'
    and l.block = 'B2'
    and l.lot = 'LOT 01';

  v_blocked := false;
  begin
    insert into public.lot_register (project_id, phase, block, lot, status)
    values (v_project_id, 'viewer', 'blocked', 'insert', 'blocked');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Viewer inserted a register row';
  end if;

  v_result_id := null;
  update public.lot_register set status = 'viewer changed'
  where id = v_lot_id returning id into v_result_id;
  if v_result_id is not null then
    raise exception 'Viewer updated a register row';
  end if;

  v_result_id := null;
  delete from public.lot_register where id = v_lot_id returning id into v_result_id;
  if v_result_id is not null then
    raise exception 'Viewer deleted a register row';
  end if;
  raise notice 'PASS: viewer read-only access';
end;
$$;
reset role;

-- Disabled users cannot see register rows.
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
  select count(*) into v_count from public.lot_register;
  if v_count <> 0 then
    raise exception 'Disabled user can read register rows';
  end if;
  raise notice 'PASS: disabled users see no register rows';
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lot_register'
  ) then
    raise exception 'lot_register is not in supabase_realtime';
  end if;
  raise notice 'PASS: lot_register is in supabase_realtime';
end;
$$;

rollback;

select 'PASS: Phase 4 lot_register schema verified; all fixtures rolled back'
  as verification_result;
