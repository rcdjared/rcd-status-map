-- 017_lot_register_history.sql
-- Keep an append-only audit trail when lot register rows are inserted, changed,
-- or deleted.

begin;

create table public.lot_register_history (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null,
  project_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

comment on table public.lot_register_history is
  'Append-only audit records for lot_register. register_id intentionally has no foreign key so deleted lots retain their history.';

create index lot_register_history_register_changed_idx
  on public.lot_register_history (register_id, changed_at desc, id desc);

create index lot_register_history_changed_at_idx
  on public.lot_register_history (changed_at);

alter table public.lot_register_history enable row level security;

revoke all on public.lot_register_history from anon, authenticated;
grant select on public.lot_register_history to authenticated;

drop policy if exists "Editors and admins can read lot register history"
  on public.lot_register_history;
create policy "Editors and admins can read lot register history"
  on public.lot_register_history
  for select
  to authenticated
  using (
    public.get_caller_role() in (
      'editor'::public.app_role,
      'admin'::public.app_role
    )
  );

create or replace function public.record_lot_register_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_values jsonb;
  v_new_values jsonb;
  v_project_id uuid;
begin
  if tg_op = 'INSERT' then
    v_new_values := jsonb_build_object(
      'project_id', new.project_id,
      'mark_id', new.mark_id,
      'phase', new.phase,
      'block', new.block,
      'lot', new.lot,
      'status', new.status
    );
    insert into public.lot_register_history (
      register_id, project_id, action, new_values, changed_by
    ) values (
      new.id, new.project_id, 'INSERT', v_new_values, auth.uid()
    );
    return new;
  elsif tg_op = 'DELETE' then
    v_old_values := jsonb_build_object(
      'project_id', old.project_id,
      'mark_id', old.mark_id,
      'phase', old.phase,
      'block', old.block,
      'lot', old.lot,
      'status', old.status
    );
    insert into public.lot_register_history (
      register_id, project_id, action, old_values, changed_by
    ) values (
      old.id, old.project_id, 'DELETE', v_old_values, auth.uid()
    );
    return old;
  end if;

  v_old_values := '{}'::jsonb;
  v_new_values := '{}'::jsonb;

  if old.project_id is distinct from new.project_id then
    v_old_values := v_old_values || jsonb_build_object('project_id', old.project_id);
    v_new_values := v_new_values || jsonb_build_object('project_id', new.project_id);
  end if;
  if old.mark_id is distinct from new.mark_id then
    v_old_values := v_old_values || jsonb_build_object('mark_id', old.mark_id);
    v_new_values := v_new_values || jsonb_build_object('mark_id', new.mark_id);
  end if;
  if old.phase is distinct from new.phase then
    v_old_values := v_old_values || jsonb_build_object('phase', old.phase);
    v_new_values := v_new_values || jsonb_build_object('phase', new.phase);
  end if;
  if old.block is distinct from new.block then
    v_old_values := v_old_values || jsonb_build_object('block', old.block);
    v_new_values := v_new_values || jsonb_build_object('block', new.block);
  end if;
  if old.lot is distinct from new.lot then
    v_old_values := v_old_values || jsonb_build_object('lot', old.lot);
    v_new_values := v_new_values || jsonb_build_object('lot', new.lot);
  end if;
  if old.status is distinct from new.status then
    v_old_values := v_old_values || jsonb_build_object('status', old.status);
    v_new_values := v_new_values || jsonb_build_object('status', new.status);
  end if;

  if v_old_values = '{}'::jsonb then
    return new;
  end if;

  v_project_id := new.project_id;
  insert into public.lot_register_history (
    register_id, project_id, action, old_values, new_values, changed_by
  ) values (
    new.id, v_project_id, 'UPDATE', v_old_values, v_new_values, auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.record_lot_register_history()
  from public, anon, authenticated;

create trigger lot_register_30_record_history
  after insert or update or delete on public.lot_register
  for each row
  execute function public.record_lot_register_history();

create or replace function public.restore_lot_register_history(
  p_history_id uuid
)
returns setof public.lot_register
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_history public.lot_register_history%rowtype;
  v_row public.lot_register%rowtype;
  v_updates jsonb;
begin
  select * into v_history
  from public.lot_register_history
  where id = p_history_id
    and action = 'UPDATE';

  if not found or v_history.old_values is null
    or v_history.old_values = '{}'::jsonb then
    raise exception 'LOT_HISTORY_NOT_RESTORABLE'
      using errcode = 'P0001', detail = 'This history record has no previous values to restore.';
  end if;

  select * into v_row
  from public.lot_register
  where id = v_history.register_id
    and project_id = v_history.project_id
  for update;

  if not found then
    raise exception 'LOT_HISTORY_ROW_NOT_FOUND'
      using errcode = 'P0002', detail = 'The lot no longer exists.';
  end if;

  v_updates := '{}'::jsonb;
  if v_history.old_values ? 'mark_id' then
    v_updates := v_updates || jsonb_build_object(
      'mark_id', v_history.old_values->'mark_id'
    );
  end if;
  if v_history.old_values ? 'phase' then
    v_updates := v_updates || jsonb_build_object(
      'phase', v_history.old_values->>'phase'
    );
  end if;
  if v_history.old_values ? 'block' then
    v_updates := v_updates || jsonb_build_object(
      'block', v_history.old_values->>'block'
    );
  end if;
  if v_history.old_values ? 'lot' then
    v_updates := v_updates || jsonb_build_object(
      'lot', v_history.old_values->>'lot'
    );
  end if;
  if v_history.old_values ? 'status' then
    v_updates := v_updates || jsonb_build_object(
      'status', v_history.old_values->>'status'
    );
  end if;

  update public.lot_register
  set mark_id = case when v_updates ? 'mark_id'
        then (v_updates->>'mark_id')::uuid else mark_id end,
      phase = case when v_updates ? 'phase'
        then v_updates->>'phase' else phase end,
      block = case when v_updates ? 'block'
        then v_updates->>'block' else block end,
      lot = case when v_updates ? 'lot'
        then v_updates->>'lot' else lot end,
      status = case when v_updates ? 'status'
        then v_updates->>'status' else status end
  where id = v_row.id
  returning * into v_row;

  if v_updates ? 'status' and v_row.mark_id is not null then
    update public.marks
    set status = v_row.status
    where id = v_row.mark_id
      and status is distinct from v_row.status;
  end if;

  return next v_row;
end;
$$;

revoke all on function public.restore_lot_register_history(uuid)
  from public, anon;
grant execute on function public.restore_lot_register_history(uuid)
  to authenticated;

create or replace function public.purge_lot_history(
  p_retain interval default interval '18 months'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  if auth.uid() is null
    or public.get_caller_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only administrators may purge lot history'
      using errcode = '42501';
  end if;

  if p_retain is null or p_retain <= interval '0' then
    raise exception 'Retention interval must be greater than zero'
      using errcode = '22023';
  end if;

  delete from public.lot_register_history
  where changed_at < now() - p_retain;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_lot_history(interval)
  from public, anon;
grant execute on function public.purge_lot_history(interval)
  to authenticated;

commit;
