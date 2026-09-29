-- Publish all moderator-approved catch photos while keeping original evidence private.

alter table public.submissions
  add column if not exists public_photo_paths text[] not null default '{}'::text[];

drop policy if exists "Active challenges are publicly readable" on public.challenges;
drop policy if exists "Scheduled challenges are publicly readable" on public.challenges;
create policy "Scheduled challenges are publicly readable" on public.challenges for select
using (current_date >= starts_on or public.is_staff());

create or replace function public.moderate_catch_submission(
  target_submission_id uuid,
  target_decision text,
  target_note text default null,
  target_length_verified boolean default false,
  target_public_photo_path text default null,
  target_public_photo_paths text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_submission public.submissions%rowtype; required_photo_count integer;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Staff access is required'; end if;
  if target_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into target_submission from public.submissions where id=target_submission_id and kind='catch' for update;
  if not found then raise exception 'Catch submission not found'; end if;
  if target_submission.status <> 'pending' then raise exception 'Only pending submissions can be moderated'; end if;
  if target_decision='approved' then
    select count(*) into required_photo_count from public.submission_photos where submission_id=target_submission_id and kind in ('measurement','hero');
    if required_photo_count <> 2 then raise exception 'Measurement and hero photos are required'; end if;
    if not target_submission.caught_in_victoria or not target_submission.caught_within_last_week or target_submission.rules_accepted_at is null then raise exception 'Catch declarations are incomplete'; end if;
    if not target_length_verified then raise exception 'The measured length must be verified'; end if;
    if coalesce(trim(target_public_photo_path),'')='' then raise exception 'A published hero image is required'; end if;
  elsif target_note is null or char_length(trim(target_note)) < 5 then
    raise exception 'Add a short reason before rejecting an entry';
  end if;
  update public.submissions set
    status=target_decision::public.content_status,
    moderation_note=nullif(trim(target_note),''), reviewed_by=auth.uid(), reviewed_at=now(),
    length_verified=target_decision='approved' and target_length_verified,
    length_verified_by=case when target_decision='approved' and target_length_verified then auth.uid() else null end,
    length_verified_at=case when target_decision='approved' and target_length_verified then now() else null end,
    public_photo_path=case when target_decision='approved' then trim(target_public_photo_path) else null end,
    public_photo_paths=case when target_decision='approved' then coalesce(target_public_photo_paths,array[trim(target_public_photo_path)]) else '{}'::text[] end
  where id=target_submission_id;
end;
$$;

create or replace function public.republish_catch_photos(
  target_submission_id uuid,
  target_public_photo_path text,
  target_public_photo_paths text[]
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Staff access is required'; end if;
  if coalesce(trim(target_public_photo_path),'')='' then raise exception 'A public hero image is required'; end if;
  update public.submissions set
    public_photo_path=trim(target_public_photo_path),
    public_photo_paths=coalesce(target_public_photo_paths,array[trim(target_public_photo_path)])
  where id=target_submission_id and kind='catch' and status='approved';
  if not found then raise exception 'Approved catch not found'; end if;
end;
$$;

create function public.get_species_catch_gallery(target_species_slug text,target_period text default 'month',result_limit integer default 24)
returns table(species_id uuid,submission_id uuid,user_id uuid,username text,display_name text,instagram_handle text,best_length_cm numeric,submitted_on date,rank integer,story text,public_photo_path text,public_photo_paths text[])
language sql stable security definer set search_path='' as $$
  with eligible as (
    select submission.species_id,submission.id submission_id,submission.user_id,submission.length_cm,submission.created_at::date submitted_on,submission.story,submission.public_photo_path,
      case when coalesce(array_length(submission.public_photo_paths,1),0)>0 then submission.public_photo_paths else array[submission.public_photo_path] end public_photo_paths,
      row_number() over(partition by submission.user_id order by submission.length_cm desc,submission.created_at asc) member_entry
    from public.submissions submission join public.species species on species.id=submission.species_id and species.slug=target_species_slug and species.is_active=true
    where submission.kind='catch' and submission.status='approved' and submission.length_verified=true and submission.caught_in_victoria=true and submission.caught_within_last_week=true and submission.public_photo_path is not null
      and case target_period when 'month' then submission.created_at>=date_trunc('month',current_date) when 'year' then submission.created_at>=date_trunc('year',current_date) when 'overall' then true else false end
  ), ranked as (select eligible.*,rank() over(order by length_cm desc)::integer placement from eligible where member_entry=1)
  select ranked.species_id,ranked.submission_id,ranked.user_id,profile.username,profile.display_name,
    case when profile.show_instagram_on_catches then profile.instagram_handle else null end,ranked.length_cm,ranked.submitted_on,ranked.placement,ranked.story,ranked.public_photo_path,ranked.public_photo_paths
  from ranked join public.profiles profile on profile.id=ranked.user_id order by ranked.placement,profile.display_name
  limit greatest(1,least(coalesce(result_limit,24),50));
$$;

revoke all on function public.moderate_catch_submission(uuid,text,text,boolean,text,text[]) from public;
grant execute on function public.moderate_catch_submission(uuid,text,text,boolean,text,text[]) to authenticated;
revoke all on function public.republish_catch_photos(uuid,text,text[]) from public;
grant execute on function public.republish_catch_photos(uuid,text,text[]) to authenticated;
revoke all on function public.get_species_catch_gallery(text,text,integer) from public;
grant execute on function public.get_species_catch_gallery(text,text,integer) to anon,authenticated;
