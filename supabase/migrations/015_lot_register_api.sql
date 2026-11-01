-- 015_lot_register_api.sql
-- Keep register and linked map-mark status changes in the same transaction.

begin;

create or replace function public.save_lot(
  p_project_id uuid,
  p_mark_id uuid,
  p_phase text,
  p_block text,
  p_lot text,
  p_status text
)
returns setof public.lot_register
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_phase text;
  v_block text;
  v_lot text;
  v_status text;
  v_mark_project_id uuid;
  v_row public.lot_register%rowtype;
  v_conflict_id uuid;
begin
  v_phase := upper(regexp_replace(p_phase, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  v_block := upper(regexp_replace(p_block, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  v_lot := upper(regexp_replace(p_lot, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  v_status := btrim(p_status);

  if v_phase is null or v_phase = ''
    or v_block is null or v_block = ''
    or v_lot is null or v_lot = '' then
    raise exception 'LOT_PBL_INVALID'
      using errcode = '22023', detail = 'Phase, block, and lot are required.';
  end if;
  if v_status is null or v_status = '' or char_length(v_status) > 120 then
    raise exception 'LOT_STATUS_INVALID'
      using errcode = '22023', detail = 'Status must contain 1 to 120 characters.';
  end if;

  -- Serialize saves for the same project/PBL, including first-time inserts.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_project_id::text || chr(31) || v_phase || chr(31) || v_block || chr(31) || v_lot,
      0
    )
  );

  if p_mark_id is not null then
    select project_id into v_mark_project_id
    from public.marks
    where id = p_mark_id
    for update;

    if v_mark_project_id is distinct from p_project_id then
      raise exception 'LOT_MARK_PROJECT_INVALID'
        using errcode = '23503', detail = 'The mark is missing or belongs to another project.';
    end if;

    select * into v_row
    from public.lot_register
    where mark_id = p_mark_id
    for update;

    if found then
      select id into v_conflict_id
      from public.lot_register
      where project_id = p_project_id
        and phase = v_phase
        and block = v_block
        and lot = v_lot
        and id <> v_row.id;

      if v_conflict_id is not null then
        raise exception 'DUPLICATE_PBL'
          using errcode = 'P0001',
            detail = 'conflicting_lot_id=' || v_conflict_id::text;
      end if;

      update public.lot_register
      set project_id = p_project_id,
          phase = v_phase,
          block = v_block,
          lot = v_lot,
          status = v_status
      where id = v_row.id
      returning * into v_row;
    else
      select id, mark_id into v_conflict_id, v_mark_project_id
      from public.lot_register
      where project_id = p_project_id
        and phase = v_phase
        and block = v_block
        and lot = v_lot
      for update;

      if v_conflict_id is not null and v_mark_project_id is not null then
        raise exception 'DUPLICATE_PBL'
          using errcode = 'P0001',
            detail = 'conflicting_lot_id=' || v_conflict_id::text;
      elsif v_conflict_id is not null then
        update public.lot_register
        set mark_id = p_mark_id,
            status = v_status
        where id = v_conflict_id
        returning * into v_row;
      else
        insert into public.lot_register (project_id, mark_id, phase, block, lot, status)
        values (p_project_id, p_mark_id, v_phase, v_block, v_lot, v_status)
        returning * into v_row;
      end if;
    end if;

    update public.marks
    set status = v_status
    where id = p_mark_id
      and status is distinct from v_status;
  else
    select * into v_row
    from public.lot_register
    where project_id = p_project_id
      and phase = v_phase
      and block = v_block
      and lot = v_lot
    for update;

    if found then
      if v_row.mark_id is not null then
        raise exception 'DUPLICATE_PBL'
          using errcode = 'P0001',
            detail = 'conflicting_lot_id=' || v_row.id::text;
      end if;

      update public.lot_register
      set status = v_status
      where id = v_row.id
      returning * into v_row;
    else
      insert into public.lot_register (project_id, phase, block, lot, status)
      values (p_project_id, null, v_phase, v_block, v_lot, v_status)
      returning * into v_row;
    end if;
  end if;

  return next v_row;
end;
$$;

create or replace function public.update_lot_status(
  p_lot_id uuid,
  p_status text
)
returns setof public.lot_register
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text := btrim(p_status);
  v_row public.lot_register%rowtype;
begin
  if v_status is null or v_status = '' or char_length(v_status) > 120 then
    raise exception 'LOT_STATUS_INVALID'
      using errcode = '22023', detail = 'Status must contain 1 to 120 characters.';
  end if;

  select * into v_row
  from public.lot_register
  where id = p_lot_id
  for update;

  if not found then
    raise exception 'LOT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_row.status is distinct from v_status then
    update public.lot_register
    set status = v_status
    where id = p_lot_id
    returning * into v_row;

    if v_row.mark_id is not null then
      update public.marks
      set status = v_status
      where id = v_row.mark_id
        and status is distinct from v_status;
    end if;
  end if;

  return next v_row;
end;
$$;

revoke all on function public.save_lot(uuid, uuid, text, text, text, text)
  from public, anon;
revoke all on function public.update_lot_status(uuid, text)
  from public, anon;
grant execute on function public.save_lot(uuid, uuid, text, text, text, text)
  to authenticated;
grant execute on function public.update_lot_status(uuid, text)
  to authenticated;

commit;
