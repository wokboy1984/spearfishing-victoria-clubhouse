-- Resolve opt-in public profiles by their unique username for friendly URLs.

create or replace function public.get_public_member_profile_by_username(target_username text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.get_public_member_profile(profile.id)
  from public.profiles profile
  where lower(profile.username) = lower(trim(target_username))
    and profile.public_profile_enabled = true
  limit 1;
$$;

revoke all on function public.get_public_member_profile_by_username(text) from public;
grant execute on function public.get_public_member_profile_by_username(text) to anon, authenticated;
