-- 016_undo_lot_register_status.sql
-- Undo linked map and register status together after verifying the latest mark audit event.

begin;

create or replace function public.undo_lot_status(
  p_lot_id uuid,
  p_previous_status text
)
returns setof public.lot_register
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mark_id uuid;
  v_mark_status text;
  v_old_status text;
  v_new_status text;
  v_changed_by uuid;
  v_row public.lot_register%rowtype;
  v_updated_count integer;
begin
  if p_previous_status is null or char_length(p_previous_status) > 120 then
    raise exception 'LOT_UNDO_INVALID'
      using errcode = '22023', detail = 'Previous status must be at most 120 characters.';
  end if;

  select mark_id into v_mark_id
  from public.lot_register
  where id = p_lot_id;

  if not found then
    raise exception 'LOT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_mark_id is not null then
    select status into v_mark_status
    from public.marks
    where id = v_mark_id
    for update;

    if not found then
      raise exception 'LOT_UNDO_CONFLICT'
        using errcode = 'P0001', detail = 'The linked mark no longer exists.';
    end if;
  end if;

  select * into v_row
  from public.lot_register
  where id = p_lot_id
  for update;

  if v_row.mark_id is distinct from v_mark_id then
    raise exception 'LOT_UNDO_CONFLICT'
      using errcode = 'P0001', detail = 'The register link changed during undo.';
  end if;

  if v_mark_id is not null then
    select old_status, new_status, changed_by
    into v_old_status, v_new_status, v_changed_by
    from public.mark_history
    where mark_id = v_mark_id
    order by changed_at desc, id desc
    limit 1;

    if v_old_status is distinct from p_previous_status
      or v_new_status is distinct from v_row.status
      or v_changed_by is distinct from auth.uid()
      or v_mark_status is distinct from v_row.status then
      raise exception 'LOT_UNDO_CONFLICT'
        using errcode = 'P0001',
          detail = 'The mark or register changed after this status update.';
    end if;
  end if;

  update public.lot_register
  set status = p_previous_status
  where id = p_lot_id
  returning * into v_row;

  if v_mark_id is not null then
    update public.marks
    set status = p_previous_status
    where id = v_mark_id
      and status = v_new_status;
    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
      raise exception 'LOT_UNDO_CONFLICT'
        using errcode = 'P0001',
          detail = 'The linked mark changed during undo.';
    end if;
  end if;

  return next v_row;
end;
$$;

revoke all on function public.undo_lot_status(uuid, text) from public, anon;
grant execute on function public.undo_lot_status(uuid, text) to authenticated;

commit;
