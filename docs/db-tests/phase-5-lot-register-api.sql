-- Phase 5: lot register API verification.
-- Run only against dev, after migrations 001-015 are applied.
-- Fixtures are created in a transaction and rolled back at the end.

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
  v_project_id uuid;
  v_mark_id uuid;
  v_other_mark_id uuid;
  v_row_id uuid;
  v_conflict_id uuid;
  v_status text;
  v_mark_status text;
  v_blocked boolean;
  v_error_detail text;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'admin'::public.app_role then
    raise exception 'Setup problem: no admin-role profile found';
  end if;

  insert into public.projects (name, map_url)
  values ('Phase 5 fixture', '/phase5-fixture-' || txid_current()::text)
  returning id into v_project_id;
  insert into public.marks (project_id, x, y, status, kind)
  values (v_project_id, 0.1, 0.1, 'available', 'fill')
  returning id into v_mark_id;
  insert into public.marks (project_id, x, y, status, kind)
  values (v_project_id, 0.2, 0.2, 'available', 'fill')
  returning id into v_other_mark_id;

  select id into v_row_id
  from public.save_lot(v_project_id, v_mark_id, ' p1 ', ' b1 ', ' lot 1 ', 'reserved');
  if not exists (
    select 1 from public.lot_register
    where id = v_row_id
      and phase = 'P1' and block = 'B1' and lot = 'LOT 1'
      and mark_id = v_mark_id and status = 'reserved'
  ) then
    raise exception 'save_lot did not create and normalize the row';
  end if;
  select status into v_mark_status from public.marks where id = v_mark_id;
  if v_mark_status is distinct from 'reserved' then
    raise exception 'save_lot did not mirror the initial status to the mark';
  end if;

  select id into v_conflict_id
  from public.save_lot(v_project_id, v_mark_id, 'P1', 'B1', 'LOT 1', 'sold');
  if v_conflict_id is distinct from v_row_id then
    raise exception 'save_lot created a duplicate instead of editing the mark row';
  end if;
  select status into v_mark_status from public.marks where id = v_mark_id;
  if v_mark_status is distinct from 'sold' then
    raise exception 'save_lot edit did not mirror status to the mark';
  end if;

  insert into public.lot_register (project_id, phase, block, lot, status)
  values (v_project_id, 'P2', 'B1', 'LOT 2', 'available')
  returning id into v_row_id;
  select id into v_conflict_id
  from public.save_lot(v_project_id, v_other_mark_id, 'P2', 'B1', 'LOT 2', 'reserved');
  if v_conflict_id is distinct from v_row_id
    or not exists (
      select 1 from public.lot_register
      where id = v_row_id and mark_id = v_other_mark_id and status = 'reserved'
    ) then
    raise exception 'save_lot did not link and update an unmapped row';
  end if;
  select status into v_mark_status from public.marks where id = v_other_mark_id;
  if v_mark_status is distinct from 'reserved' then
    raise exception 'Linking an unmapped row did not mirror status to the mark';
  end if;

  select id into v_row_id
  from public.update_lot_status(v_row_id, 'sold');
  select status into v_mark_status from public.marks where id = v_other_mark_id;
  if v_mark_status is distinct from 'sold' then
    raise exception 'update_lot_status did not mirror status to the mark';
  end if;

  insert into public.lot_register (project_id, mark_id, phase, block, lot, status)
  values (v_project_id, null, 'P3', 'B1', 'LOT 3', 'available')
  returning id into v_conflict_id;
  v_blocked := false;
  begin
    perform public.save_lot(v_project_id, v_mark_id, 'P3', 'B1', 'LOT 3', 'reserved');
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error_detail = pg_exception_detail;
    v_blocked := v_error_detail = 'conflicting_lot_id=' || v_conflict_id::text;
  end;
  if not v_blocked then
    raise exception 'save_lot did not report the conflicting row id';
  end if;

  select id into v_row_id
  from public.update_lot_status(v_conflict_id, 'sold');
  select status into v_status from public.lot_register where id = v_row_id;
  if v_status is distinct from 'sold' then
    raise exception 'update_lot_status did not update the register row';
  end if;
  raise notice 'PASS: save, edit, link, conflict ID, and atomic status mirroring';
end;
$$;

rollback;

select 'PASS: save, edit, link, conflict ID, and atomic status mirroring; fixtures rolled back.'
  as verification_result;
