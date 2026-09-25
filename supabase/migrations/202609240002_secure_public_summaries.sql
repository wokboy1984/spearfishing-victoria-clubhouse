-- Replace security-definer views with narrowly scoped aggregate functions.
-- Both functions expose public totals only for published challenges and ballots.

alter view public.species_vote_totals set (security_invoker = true);
alter view public.challenge_leaderboard set (security_invoker = true);
revoke select on public.species_vote_totals from anon, authenticated;
revoke select on public.challenge_leaderboard from anon, authenticated;

create function public.get_species_vote_totals(target_ballot_id uuid default null)
returns table (
  ballot_id uuid,
  species_id uuid,
  slug text,
  common_name text,
  votes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    option.ballot_id,
    option.species_id,
    species.slug,
    species.common_name,
    count(vote.user_id)::integer as votes
  from public.ballot_options option
  join public.ballots ballot
    on ballot.id = option.ballot_id
    and ballot.status in ('open', 'closed')
  join public.species species on species.id = option.species_id
  left join public.species_votes vote
    on vote.ballot_id = option.ballot_id
    and vote.species_id = option.species_id
  where target_ballot_id is null or option.ballot_id = target_ballot_id
  group by option.ballot_id, option.species_id, species.slug, species.common_name;
$$;

create function public.get_challenge_leaderboard(target_challenge_id uuid default null)
returns table (
  challenge_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  points integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    event.challenge_id,
    event.user_id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    sum(event.points)::integer as points
  from public.point_events event
  join public.challenges challenge
    on challenge.id = event.challenge_id
    and challenge.status in ('active', 'closed')
  join public.profiles profile on profile.id = event.user_id
  where target_challenge_id is null or event.challenge_id = target_challenge_id
  group by event.challenge_id, event.user_id, profile.username, profile.display_name, profile.avatar_url;
$$;

revoke all on function public.get_species_vote_totals(uuid) from public;
revoke all on function public.get_challenge_leaderboard(uuid) from public;
grant execute on function public.get_species_vote_totals(uuid) to anon, authenticated;
grant execute on function public.get_challenge_leaderboard(uuid) to anon, authenticated;
