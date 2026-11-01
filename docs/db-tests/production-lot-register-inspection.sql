-- Read-only inspection of the previous Lot Register attempt.
-- Run only in the production SQL Editor after confirming exports are saved.
-- Do not run cleanup until these results have been reviewed.

select to_regclass('public.lot_register') as lot_register_table;

select count(*) as lot_register_rows
from public.lot_register;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'lot_register'
order by indexname;

select t.tgname as trigger_name, p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = to_regclass('public.lot_register')
  and not t.tgisinternal
order by t.tgname;

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'lot_register'
order by policyname;

select conname, contype
from pg_constraint
where conrelid = to_regclass('public.lot_register')
order by conname;

select pubname
from pg_publication_tables
where schemaname = 'public'
  and tablename = 'lot_register'
order by pubname;

select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'normalize_lot_register_pbl',
    'set_lot_register_metadata',
    'save_lot',
    'update_lot_status'
  )
order by p.proname, arguments;
