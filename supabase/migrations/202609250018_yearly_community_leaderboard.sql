-- Yearly standings combine the All Species Cup with awarded community contributions.

create or replace function public.get_yearly_community_leaderboard(
  target_year integer default extract(year from current_date)::integer
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  species_entered integer,
  catch_points integer,
  contribution_points integer,
  points integer
)
language sql stable security definer set search_path = '' as $$
  with catches as (
    select * from public.get_all_species_cup(target_year)
  ),
  contributions as (
    select event.user_id, coalesce(sum(event.points), 0)::integer as contribution_points
    from public.point_events event
    where extract(year from event.created_at)::integer = target_year
    group by event.user_id
  ),
  members as (
    select catches.user_id from catches
    union
    select contributions.user_id from contributions
  )
  select
    members.user_id,
    profile.username,
    profile.display_name,
    coalesce(catches.species_entered, 0)::integer,
    coalesce(catches.points, 0)::integer,
    coalesce(contributions.contribution_points, 0)::integer,
    (coalesce(catches.points, 0) + coalesce(contributions.contribution_points, 0))::integer
  from members
  join public.profiles profile on profile.id = members.user_id
  left join catches on catches.user_id = members.user_id
  left join contributions on contributions.user_id = members.user_id
  order by points desc, contribution_points desc, profile.display_name;
$$;

revoke all on function public.get_yearly_community_leaderboard(integer) from public;
grant execute on function public.get_yearly_community_leaderboard(integer) to anon, authenticated;
