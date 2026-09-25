-- Monthly programs become live from their date windows; staff can queue them in advance.

drop policy if exists "Open ballots are publicly readable" on public.ballots;
create policy "Scheduled ballots are publicly readable" on public.ballots for select
using (now() >= opens_at or public.is_staff());

drop policy if exists "Members cast an open ballot vote" on public.species_votes;
create policy "Members cast a scheduled ballot vote" on public.species_votes for insert
with check (user_id=auth.uid() and exists(select 1 from public.ballots ballot where ballot.id=ballot_id and now() between ballot.opens_at and ballot.closes_at));

drop policy if exists "Members change their open ballot vote" on public.species_votes;
create policy "Members change their scheduled ballot vote" on public.species_votes for update
using (user_id=auth.uid())
with check (user_id=auth.uid() and exists(select 1 from public.ballots ballot where ballot.id=ballot_id and now() between ballot.opens_at and ballot.closes_at));

create or replace function public.get_species_vote_totals(target_ballot_id uuid default null)
returns table(ballot_id uuid,species_id uuid,slug text,common_name text,votes integer)
language sql stable security definer set search_path='' as $$
 select option.ballot_id,option.species_id,species.slug,species.common_name,count(vote.user_id)::integer
 from public.ballot_options option
 join public.ballots ballot on ballot.id=option.ballot_id and now()>=ballot.opens_at
 join public.species species on species.id=option.species_id
 left join public.species_votes vote on vote.ballot_id=option.ballot_id and vote.species_id=option.species_id
 where target_ballot_id is null or option.ballot_id=target_ballot_id
 group by option.ballot_id,option.species_id,species.slug,species.common_name;
$$;

create or replace function public.attach_current_monthly_challenge()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.kind='catch' and new.challenge_id is null then
   select challenge.id into new.challenge_id from public.challenges challenge
   where challenge.species_id=new.species_id and current_date between challenge.starts_on and challenge.ends_on
   order by challenge.starts_on desc limit 1;
 end if;
 return new;
end; $$;
drop trigger if exists submissions_attach_current_monthly_challenge on public.submissions;
create trigger submissions_attach_current_monthly_challenge before insert on public.submissions
for each row execute function public.attach_current_monthly_challenge();

create or replace function public.get_challenge_catch_leaderboard(target_challenge_id uuid default null)
returns table(challenge_id uuid,user_id uuid,username text,display_name text,avatar_url text,submission_id uuid,best_length_cm numeric,rank integer,submission_points integer,placement_bonus integer,points integer)
language sql stable security definer set search_path='' as $$
 with eligible as (
   select challenge.id challenge_id,submission.user_id,submission.id submission_id,submission.length_cm,
     row_number() over(partition by challenge.id,submission.user_id order by submission.length_cm desc,submission.created_at asc) member_entry
   from public.challenges challenge join public.submissions submission
     on submission.challenge_id=challenge.id and submission.species_id=challenge.species_id and submission.kind='catch'
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

create or replace function public.moderate_recipe_submission(target_submission_id uuid,target_decision text,target_note text default null,target_public_photo_path text default null,target_public_photo_paths text[] default null)
returns void language plpgsql security definer set search_path=public as $$
declare target_submission public.submissions%rowtype; target_challenge_id uuid;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff access is required'; end if;
 if target_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
 select * into target_submission from public.submissions where id=target_submission_id and kind='recipe' for update;
 if not found then raise exception 'Recipe submission not found'; end if;
 if target_submission.status<>'pending' then raise exception 'Only pending recipes can be moderated'; end if;
 if target_decision='approved' and coalesce(trim(target_public_photo_path),'')='' then raise exception 'A published recipe image is required'; end if;
 if target_decision='rejected' and char_length(coalesce(trim(target_note),''))<5 then raise exception 'Add a short reason before rejecting this recipe'; end if;
 update public.submissions set status=target_decision::public.content_status,moderation_note=nullif(trim(target_note),''),reviewed_by=auth.uid(),reviewed_at=now(),public_photo_path=case when target_decision='approved' then trim(target_public_photo_path) else null end where id=target_submission_id;
 update public.recipes set public_photo_paths=case when target_decision='approved' then coalesce(target_public_photo_paths,array[trim(target_public_photo_path)]) else '{}'::text[] end where submission_id=target_submission_id;
 if target_decision='approved' then
   select id into target_challenge_id from public.challenges where species_id=target_submission.species_id and current_date between starts_on and ends_on order by starts_on desc limit 1;
   if target_challenge_id is not null and not exists(select 1 from public.point_events where submission_id=target_submission_id and reason='Published community recipe') then
     insert into public.point_events(user_id,challenge_id,submission_id,reason,points,awarded_by) values(target_submission.user_id,target_challenge_id,target_submission_id,'Published community recipe',10,auth.uid());
   end if;
 end if;
end; $$;
