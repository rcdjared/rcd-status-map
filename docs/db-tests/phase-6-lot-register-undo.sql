-- Phase 6: atomic status-undo verification.
-- Run only against dev, after migrations 001-016 are applied.
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
  v_lot_id uuid;
  v_status text;
  v_blocked boolean;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'admin'::public.app_role then
    raise exception 'Setup problem: no admin-role profile found';
  end if;

  insert into public.projects (name, map_url)
  values ('Phase 6 undo fixture', '/phase6-undo-fixture-' || txid_current()::text)
  returning id into v_project_id;
  insert into public.marks (project_id, x, y, status, kind)
  values (v_project_id, 0.1, 0.1, 'available', 'fill')
  returning id into v_mark_id;

  select id into v_lot_id
  from public.save_lot(v_project_id, v_mark_id, 'P1', 'B1', 'LOT 1', 'reserved');
  select id into v_lot_id
  from public.undo_lot_status(v_lot_id, 'available');
  select status into v_status from public.marks where id = v_mark_id;
  if v_status is distinct from 'available'
    or not exists (
      select 1 from public.lot_register
      where id = v_lot_id and status = 'available'
    ) then
    raise exception 'Undo did not restore the register and mark together';
  end if;

  v_blocked := false;
  begin
    perform public.undo_lot_status(v_lot_id, 'stale-status');
  exception when sqlstate 'P0001' then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Undo accepted a stale or mismatched status transition';
  end if;

  raise notice 'PASS: linked lot status undo is atomic and refuses stale history';
end;
$$;

rollback;

select 'PASS: linked lot status undo is atomic; fixtures rolled back.'
  as verification_result;
