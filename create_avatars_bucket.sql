-- =============================================================
-- Create "avatars" Supabase Storage bucket for athlete profile photos
-- =============================================================
-- Athlete app (primal-fitness-athlete) uploads profile photos to
-- storage.from('avatars') and writes the resulting public URL back
-- to students.photo. The management webapp stores photos as base64
-- directly on students.photo; both render via <img src>, so sync
-- happens automatically through the shared column.
--
-- File size cap: 20 MB per file (20 * 1024 * 1024 = 20971520 bytes)
-- MIME types:    image/* (jpeg, png, webp, gif, heic, heif)
-- Public:        true (URLs returned by getPublicUrl are directly
--                loadable; this matches how students.photo is used
--                today)
-- RLS:           permissive anon+authenticated (matches the
--                pattern used on every other table in this project
--                — no Supabase Auth yet, all access control is
--                client-side / anon-key-based)
--
-- Run pattern: preview-first. The script wraps everything in a
-- transaction and ROLLBACKs by default. Review the SELECT outputs
-- at the bottom, then flip `ROLLBACK;` → `COMMIT;` and re-run.
-- =============================================================

BEGIN;

-- -------- 1. Create the bucket --------
-- 20 MB = 20971520 bytes. Adjust file_size_limit if you want a
-- different cap later. Free-tier Supabase hard-caps at 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  20971520,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -------- 2. RLS policies on storage.objects --------
-- Permissive, scoped to bucket_id = 'avatars'. Matches the pattern
-- used on students / coaches / invoices / etc. If Supabase Auth is
-- adopted later, tighten these to check auth.uid() against the
-- object's owner column.

drop policy if exists "avatars_public_select" on storage.objects;
create policy "avatars_public_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_public_insert" on storage.objects;
create policy "avatars_public_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "avatars_public_update" on storage.objects;
create policy "avatars_public_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');

drop policy if exists "avatars_public_delete" on storage.objects;
create policy "avatars_public_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'avatars');

-- -------- 3. Preview --------
-- Verify the bucket row and policy set before committing.

select id, name, public, file_size_limit, allowed_mime_types, created_at
  from storage.buckets
  where id = 'avatars';

select policyname, cmd, roles, qual, with_check
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname like 'avatars_%'
  order by policyname;

-- -------- 4. Commit gate --------
-- Default is ROLLBACK so this script is safe to dry-run. After
-- reviewing the two SELECTs above, change `ROLLBACK;` to `COMMIT;`
-- and re-run this file.

ROLLBACK;
-- COMMIT;
