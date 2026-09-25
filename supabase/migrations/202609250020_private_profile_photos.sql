-- Private profile photos become readable only while the member profile is public.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('profile-images','profile-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "Members upload their own profile photo" on storage.objects for insert to authenticated
with check (bucket_id='profile-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Members replace their own profile photo" on storage.objects for update to authenticated
using (bucket_id='profile-images' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='profile-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Members remove their own profile photo" on storage.objects for delete to authenticated
using (bucket_id='profile-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Owners staff and public profiles read profile photos" on storage.objects for select
using (bucket_id='profile-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_staff() or exists (select 1 from public.profiles profile where profile.id::text=(storage.foldername(name))[1] and profile.public_profile_enabled=true)));

create or replace function public.get_public_member_avatar(target_member_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select profile.avatar_url from public.profiles profile where profile.id=target_member_id and profile.public_profile_enabled=true;
$$;
revoke all on function public.get_public_member_avatar(uuid) from public;
grant execute on function public.get_public_member_avatar(uuid) to anon,authenticated;
