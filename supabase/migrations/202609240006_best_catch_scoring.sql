-- Competition scoring rewards participation while keeping size-based placement
-- as a meaningful bonus. Only each member's best verified catch counts.

alter table public.submissions
  add column length_verified boolean not null default false,
  add column length_verified_by uuid references public.profiles(id) on delete set null,
  add column length_verified_at timestamptz;

alter table public.submissions
  add constraint verified_catches_have_measurements check (
    not length_verified
    or (
      kind = 'catch'
      and length_cm is not null
      and length_verified_by is not null
      and length_verified_at is not null
    )
  );

create function public.get_challenge_catch_leaderboard(target_challenge_id uuid default null)
returns table (
  challenge_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  submission_id uuid,
  best_length_cm numeric,
  rank integer,
  submission_points integer,
  placement_bonus integer,
  points integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      challenge.id as challenge_id,
      submission.user_id,
      submission.id as submission_id,
      submission.length_cm,
      row_number() over (
        partition by challenge.id, submission.user_id
        order by submission.length_cm desc, submission.created_at asc
      ) as member_entry
    from public.challenges challenge
    join public.submissions submission
      on submission.challenge_id = challenge.id
      and submission.species_id = challenge.species_id
      and submission.kind = 'catch'
      and submission.status = 'approved'
      and submission.length_verified = true
      and submission.activity_date between challenge.starts_on and challenge.ends_on
    where challenge.status in ('active', 'closed')
      and (target_challenge_id is null or challenge.id = target_challenge_id)
  ),
  best_entries as (
    select * from eligible where member_entry = 1
  ),
  ranked as (
    select
      best_entries.*,
      rank() over (
        partition by challenge_id
        order by length_cm desc
      )::integer as placement
    from best_entries
  )
  select
    ranked.challenge_id,
    ranked.user_id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    ranked.submission_id,
    ranked.length_cm as best_length_cm,
    ranked.placement as rank,
    15 as submission_points,
    case when ranked.placement <= 10 then 11 - ranked.placement else 0 end as placement_bonus,
    15 + case when ranked.placement <= 10 then 11 - ranked.placement else 0 end as points
  from ranked
  join public.profiles profile on profile.id = ranked.user_id
  order by ranked.challenge_id, ranked.placement, profile.username;
$$;

create function public.get_all_species_cup(target_year integer default extract(year from current_date)::integer)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  species_entered integer,
  submission_points integer,
  placement_bonus integer,
  points integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      submission.user_id,
      submission.species_id,
      submission.length_cm,
      row_number() over (
        partition by submission.user_id, submission.species_id
        order by submission.length_cm desc, submission.created_at asc
      ) as member_entry
    from public.submissions submission
    join public.species species on species.id = submission.species_id and species.is_active = true
    where submission.kind = 'catch'
      and submission.status = 'approved'
      and submission.length_verified = true
      and extract(year from submission.activity_date)::integer = target_year
  ),
  ranked as (
    select
      eligible.*,
      rank() over (
        partition by species_id
        order by length_cm desc
      )::integer as placement
    from eligible
    where member_entry = 1
  ),
  scored as (
    select
      user_id,
      species_id,
      15 as submission_points,
      case when placement <= 10 then 11 - placement else 0 end as placement_bonus
    from ranked
  )
  select
    scored.user_id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    count(scored.species_id)::integer as species_entered,
    sum(scored.submission_points)::integer as submission_points,
    sum(scored.placement_bonus)::integer as placement_bonus,
    sum(scored.submission_points + scored.placement_bonus)::integer as points
  from scored
  join public.profiles profile on profile.id = scored.user_id
  group by scored.user_id, profile.username, profile.display_name, profile.avatar_url
  order by points desc, placement_bonus desc, profile.username;
$$;

revoke all on function public.get_challenge_catch_leaderboard(uuid) from public;
revoke all on function public.get_all_species_cup(integer) from public;
grant execute on function public.get_challenge_catch_leaderboard(uuid) to anon, authenticated;
grant execute on function public.get_all_species_cup(integer) to anon, authenticated;
