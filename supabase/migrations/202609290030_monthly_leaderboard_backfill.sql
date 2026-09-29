-- Count approved catches by the monthly challenge's species and date window.
-- This includes valid older entries created before challenge_id was attached automatically.

create or replace function public.get_challenge_catch_leaderboard(target_challenge_id uuid default null)
returns table(challenge_id uuid,user_id uuid,username text,display_name text,avatar_url text,submission_id uuid,best_length_cm numeric,rank integer,submission_points integer,placement_bonus integer,points integer)
language sql stable security definer set search_path='' as $$
 with eligible as (
   select challenge.id challenge_id,submission.user_id,submission.id submission_id,submission.length_cm,
     row_number() over(partition by challenge.id,submission.user_id order by submission.length_cm desc,submission.created_at asc) member_entry
   from public.challenges challenge join public.submissions submission
     on submission.species_id=challenge.species_id and submission.kind='catch'
     and submission.status='approved' and submission.length_verified=true and submission.caught_in_victoria=true and submission.caught_within_last_week=true
     and submission.created_at::date between challenge.starts_on and challenge.ends_on
   where target_challenge_id is null or challenge.id=target_challenge_id
 ), ranked as (
   select eligible.*,rank() over(partition by challenge_id order by length_cm desc)::integer placement from eligible where member_entry=1
 )
 select ranked.challenge_id,ranked.user_id,profile.username,profile.display_name,profile.avatar_url,ranked.submission_id,ranked.length_cm,
   ranked.placement,15,case when ranked.placement<=10 then 11-ranked.placement else 0 end,
   15+case when ranked.placement<=10 then 11-ranked.placement else 0 end
 from ranked join public.profiles profile on profile.id=ranked.user_id
 order by ranked.challenge_id,ranked.placement,profile.username;
$$;

revoke all on function public.get_challenge_catch_leaderboard(uuid) from public;
grant execute on function public.get_challenge_catch_leaderboard(uuid) to anon, authenticated;
