-- Opt-in public member pages with independently controlled catch and recipe collections.

alter table public.profiles
  add column if not exists public_profile_enabled boolean not null default false,
  add column if not exists show_catches_on_profile boolean not null default true,
  add column if not exists show_recipes_on_profile boolean not null default true;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Members read their own or public profiles" on public.profiles for select
using (id = auth.uid() or public.is_staff() or public_profile_enabled = true);

grant update (public_profile_enabled, show_catches_on_profile, show_recipes_on_profile) on public.profiles to authenticated;

create or replace function public.get_public_member_profile(target_member_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'member_id', profile.id,
    'display_name', profile.display_name,
    'instagram_handle', case when profile.show_instagram_on_catches then profile.instagram_handle else null end,
    'joined_on', profile.created_at::date,
    'show_catches', profile.show_catches_on_profile,
    'show_recipes', profile.show_recipes_on_profile,
    'species_count', case when profile.show_catches_on_profile then (
      select count(distinct submission.species_id) from public.submissions submission
      where submission.user_id=profile.id and submission.kind='catch' and submission.status='approved'
    ) else 0 end,
    'catch_count', case when profile.show_catches_on_profile then (
      select count(*) from public.submissions submission
      where submission.user_id=profile.id and submission.kind='catch' and submission.status='approved'
    ) else 0 end,
    'recipe_count', case when profile.show_recipes_on_profile then (
      select count(*) from public.submissions submission
      where submission.user_id=profile.id and submission.kind='recipe' and submission.status='approved'
    ) else 0 end,
    'year_points', coalesce((
      select standing.points from public.get_yearly_community_leaderboard(extract(year from current_date)::integer) standing
      where standing.user_id=profile.id
    ),0),
    'catches', case when profile.show_catches_on_profile then coalesce((
      select jsonb_agg(jsonb_build_object(
        'submission_id',submission.id,'species_slug',species.slug,'species_name',species.common_name,
        'length_cm',submission.length_cm,'story',submission.story,'public_photo_path',submission.public_photo_path,
        'published_on',coalesce(submission.reviewed_at,submission.created_at)::date
      ) order by coalesce(submission.reviewed_at,submission.created_at) desc)
      from public.submissions submission join public.species species on species.id=submission.species_id
      where submission.user_id=profile.id and submission.kind='catch' and submission.status='approved' and submission.public_photo_path is not null
    ),'[]'::jsonb) else '[]'::jsonb end,
    'recipes', case when profile.show_recipes_on_profile then coalesce((
      select jsonb_agg(jsonb_build_object(
        'submission_id',submission.id,'species_slug',species.slug,'species_name',species.common_name,
        'title',submission.title,'story',submission.story,'public_photo_path',submission.public_photo_path,
        'public_photo_paths',recipe.public_photo_paths,'published_on',coalesce(submission.reviewed_at,submission.created_at)::date
      ) order by coalesce(submission.reviewed_at,submission.created_at) desc)
      from public.submissions submission join public.species species on species.id=submission.species_id
      join public.recipes recipe on recipe.submission_id=submission.id
      where submission.user_id=profile.id and submission.kind='recipe' and submission.status='approved'
    ),'[]'::jsonb) else '[]'::jsonb end
  ) into result
  from public.profiles profile
  where profile.id=target_member_id and profile.public_profile_enabled=true;
  return result;
end; $$;

revoke all on function public.get_public_member_profile(uuid) from public;
grant execute on function public.get_public_member_profile(uuid) to anon,authenticated;
