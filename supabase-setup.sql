-- Run this in Supabase SQL Editor after creating your project.
-- 1) Create the admin user in Authentication > Users (disable public sign-ups).
-- 2) Replace the email below with that exact admin email, then run this SQL.
create table if not exists public.zro_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null
);
alter table public.zro_admins enable row level security;

create or replace function public.zro_is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.zro_admins
    where user_id = auth.uid()
  );
$$;

create table if not exists public.zro_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  media_url text not null,
  storage_path text not null,
  media_type text not null check (media_type in ('image','video')),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.zro_posts enable row level security;

drop policy if exists "Public can view published ZRO posts" on public.zro_posts;
create policy "Public can view published ZRO posts"
on public.zro_posts for select using (published = true or public.zro_is_admin());

drop policy if exists "Admins can insert ZRO posts" on public.zro_posts;
create policy "Admins can insert ZRO posts"
on public.zro_posts for insert with check (public.zro_is_admin());

drop policy if exists "Admins can update ZRO posts" on public.zro_posts;
create policy "Admins can update ZRO posts"
on public.zro_posts for update using (public.zro_is_admin()) with check (public.zro_is_admin());

drop policy if exists "Admins can delete ZRO posts" on public.zro_posts;
create policy "Admins can delete ZRO posts"
on public.zro_posts for delete using (public.zro_is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zro-media','zro-media',true,41943040,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = 41943040;

drop policy if exists "Public can view ZRO media" on storage.objects;
create policy "Public can view ZRO media" on storage.objects
for select using (bucket_id = 'zro-media');

drop policy if exists "Admins can upload ZRO media" on storage.objects;
create policy "Admins can upload ZRO media" on storage.objects
for insert with check (bucket_id = 'zro-media' and public.zro_is_admin());

drop policy if exists "Admins can update ZRO media" on storage.objects;
create policy "Admins can update ZRO media" on storage.objects
for update using (bucket_id = 'zro-media' and public.zro_is_admin())
with check (bucket_id = 'zro-media' and public.zro_is_admin());

drop policy if exists "Admins can delete ZRO media" on storage.objects;
create policy "Admins can delete ZRO media" on storage.objects
for delete using (bucket_id = 'zro-media' and public.zro_is_admin());

-- After creating the admin user, run this separately after replacing the email:
-- insert into public.zro_admins (user_id, email)
-- select id, email from auth.users where email = 'YOUR_ADMIN_EMAIL';


-- ZRO APPLICATIONS: private applicant records and private documents.
-- Public users may submit an application; only listed admins can read/update it.
create table if not exists public.zro_applications (
  id uuid primary key,
  full_name text not null check (char_length(full_name) between 2 and 120),
  father_name text not null,
  email text not null,
  phone text not null,
  city text not null,
  address text not null,
  cnic text not null,
  application_type text not null check (application_type in ('Volunteer','Paid staff')),
  department text not null,
  education text not null,
  experience text not null,
  motivation text not null,
  availability text not null,
  police_file_path text not null,
  cv_file_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.zro_applications enable row level security;
drop policy if exists "Public can submit ZRO applications" on public.zro_applications;
create policy "Public can submit ZRO applications" on public.zro_applications
for insert to anon, authenticated with check (status = 'pending');
drop policy if exists "Admins can read ZRO applications" on public.zro_applications;
create policy "Admins can read ZRO applications" on public.zro_applications
for select to authenticated using (public.zro_is_admin());
drop policy if exists "Admins can update ZRO applications" on public.zro_applications;
create policy "Admins can update ZRO applications" on public.zro_applications
for update to authenticated using (public.zro_is_admin()) with check (public.zro_is_admin());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('zro-private-applications','zro-private-applications',false,5242880,
 array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=5242880,
 allowed_mime_types=array['application/pdf','image/jpeg','image/png'];
drop policy if exists "Applicants can upload private application files" on storage.objects;
create policy "Applicants can upload private application files" on storage.objects
for insert to anon, authenticated
with check (bucket_id='zro-private-applications' and array_length(storage.foldername(name),1)=1);
drop policy if exists "Admins can view private application files" on storage.objects;
create policy "Admins can view private application files" on storage.objects
for select to authenticated
using (bucket_id='zro-private-applications' and public.zro_is_admin());
drop policy if exists "Admins can delete private application files" on storage.objects;
create policy "Admins can delete private application files" on storage.objects
for delete to authenticated
using (bucket_id='zro-private-applications' and public.zro_is_admin());
