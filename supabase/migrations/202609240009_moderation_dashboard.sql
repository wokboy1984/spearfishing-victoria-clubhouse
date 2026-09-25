-- Staff-only catch moderation queue and audited approval decisions.

create or replace function public.get_moderation_submissions(target_status text default null)
returns table (
  submission_id uuid,
  member_id uuid,
  username text,
  display_name text,
  instagram_handle text,
  show_instagram boolean,
  species_id uuid,
  species_slug text,
  species_name text,
  submission_kind text,
  title text,
  story text,
  length_cm numeric,
  caught_in_victoria boolean,
  caught_within_last_week boolean,
  rules_accepted_at timestamptz,
  submission_status text,
  moderation_note text,
  length_verified boolean,
  public_photo_path text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  photos jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Staff access is required';
  end if;

  if target_status is not null and target_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Unknown moderation status';
  end if;

  return query
  select
    submission.id,
    submission.user_id,
    profile.username,
    profile.display_name,
    profile.instagram_handle,
    profile.show_instagram_on_catches,
    species.id,
    species.slug,
    species.common_name,
    submission.kind::text,
    submission.title,
    submission.story,
    submission.length_cm,
    submission.caught_in_victoria,
    submission.caught_within_last_week,
    submission.rules_accepted_at,
    submission.status::text,
    submission.moderation_note,
    submission.length_verified,
    submission.public_photo_path,
    submission.created_at,
    submission.reviewed_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', photo.id,
          'kind', photo.kind::text,
          'storage_path', photo.storage_path,
          'display_order', photo.display_order
        ) order by photo.display_order
      )
      from public.submission_photos photo
      where photo.submission_id = submission.id
    ), '[]'::jsonb)
  from public.submissions submission
  join public.profiles profile on profile.id = submission.user_id
  left join public.species species on species.id = submission.species_id
  where submission.kind = 'catch'
    and (target_status is null or submission.status::text = target_status)
  order by
    case submission.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    coalesce(submission.reviewed_at, submission.created_at) desc
  limit 200;
end;
$$;

create or replace function public.moderate_catch_submission(
  target_submission_id uuid,
  target_decision text,
  target_note text default null,
  target_length_verified boolean default false,
  target_public_photo_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_submission public.submissions%rowtype;
  required_photo_count integer;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Staff access is required';
  end if;

  if target_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into target_submission
  from public.submissions
  where id = target_submission_id and kind = 'catch'
  for update;

  if not found then
    raise exception 'Catch submission not found';
  end if;

  if target_submission.status <> 'pending' then
    raise exception 'Only pending submissions can be moderated';
  end if;

  if target_decision = 'approved' then
    select count(*) into required_photo_count
    from public.submission_photos
    where submission_id = target_submission_id
      and kind in ('measurement', 'hero');

    if required_photo_count <> 2 then
      raise exception 'Measurement and hero photos are required';
    end if;
    if not target_submission.caught_in_victoria
      or not target_submission.caught_within_last_week
      or target_submission.rules_accepted_at is null then
      raise exception 'Catch declarations are incomplete';
    end if;
    if not target_length_verified then
      raise exception 'The measured length must be verified';
    end if;
    if target_public_photo_path is null or trim(target_public_photo_path) = '' then
      raise exception 'A published hero image is required';
    end if;
  elsif target_note is null or char_length(trim(target_note)) < 5 then
    raise exception 'Add a short reason before rejecting an entry';
  end if;

  update public.submissions
  set
    status = target_decision::public.content_status,
    moderation_note = nullif(trim(target_note), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    length_verified = target_decision = 'approved' and target_length_verified,
    length_verified_by = case when target_decision = 'approved' and target_length_verified then auth.uid() else null end,
    length_verified_at = case when target_decision = 'approved' and target_length_verified then now() else null end,
    public_photo_path = case when target_decision = 'approved' then trim(target_public_photo_path) else null end
  where id = target_submission_id;
end;
$$;

revoke all on function public.get_moderation_submissions(text) from public;
revoke all on function public.moderate_catch_submission(uuid, text, text, boolean, text) from public;
grant execute on function public.get_moderation_submissions(text) to authenticated;
grant execute on function public.moderate_catch_submission(uuid, text, text, boolean, text) to authenticated;
