-- Member-facing submission status and persistent in-app notification state.

alter table public.submissions
  add column member_seen_at timestamptz;

create or replace function public.get_my_submissions()
returns table (
  submission_id uuid,
  species_slug text,
  species_name text,
  submission_title text,
  story text,
  length_cm numeric,
  submission_status text,
  moderation_note text,
  public_photo_path text,
  hero_photo_path text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  notification_unread boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;

  return query
  select
    submission.id,
    species.slug,
    species.common_name,
    submission.title,
    submission.story,
    submission.length_cm,
    submission.status::text,
    submission.moderation_note,
    submission.public_photo_path,
    (
      select photo.storage_path
      from public.submission_photos photo
      where photo.submission_id = submission.id and photo.kind = 'hero'
      limit 1
    ),
    submission.created_at,
    submission.reviewed_at,
    submission.reviewed_at is not null
      and (submission.member_seen_at is null or submission.member_seen_at < submission.reviewed_at)
  from public.submissions submission
  left join public.species species on species.id = submission.species_id
  where submission.user_id = auth.uid()
    and submission.kind = 'catch'
  order by submission.created_at desc
  limit 100;
end;
$$;

create or replace function public.mark_my_submission_notifications_seen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;

  update public.submissions
  set member_seen_at = now()
  where user_id = auth.uid()
    and kind = 'catch'
    and reviewed_at is not null
    and (member_seen_at is null or member_seen_at < reviewed_at);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.get_my_submissions() from public;
revoke all on function public.mark_my_submission_notifications_seen() from public;
grant execute on function public.get_my_submissions() to authenticated;
grant execute on function public.mark_my_submission_notifications_seen() to authenticated;
