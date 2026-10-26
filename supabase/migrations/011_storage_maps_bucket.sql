-- 011_storage_maps_bucket.sql
-- Create 'maps' storage bucket for subdivision map uploads (PDF, PNG, JPG, WebP)
-- and configure Row Level Security policies for public reading and admin uploads.

-- 1. Create the bucket if it does not already exist
insert into storage.buckets (id, name, public)
values ('maps', 'maps', true)
on conflict (id) do update set public = true;

-- 2. Drop existing policies to allow clean re-application
drop policy if exists "Public can read map images" on storage.objects;
drop policy if exists "Admins can upload map images" on storage.objects;
drop policy if exists "Admins can update map images" on storage.objects;
drop policy if exists "Admins can delete map images" on storage.objects;

-- 3. Policy: Anyone can read/download maps (needed for viewer display)
create policy "Public can read map images"
  on storage.objects
  for select
  using (bucket_id = 'maps');

-- 4. Policy: Editors and Admins can upload map images
create policy "Admins can upload map images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'maps'
    and public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role)
  );

-- 5. Policy: Editors and Admins can update map images
create policy "Admins can update map images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'maps'
    and public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role)
  )
  with check (
    bucket_id = 'maps'
    and public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role)
  );

-- 6. Policy: Admins can delete map images
create policy "Admins can delete map images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'maps'
    and public.get_caller_role() = 'admin'::public.app_role
  );
