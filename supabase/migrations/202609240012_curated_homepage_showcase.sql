-- Staff-curated homepage imagery. Public readers receive only already-published
-- catch photos; private evidence paths never cross this boundary.

alter table public.submissions
  add column if not exists homepage_featured boolean not null default false,
  add column if not exists homepage_feature_order integer;

create or replace function public.get_homepage_showcase(target_limit integer default 8)
returns table (
  submission_id uuid,
  species_name text,
  species_slug text,
  display_name text,
  instagram_handle text,
  length_cm numeric,
  story text,
  public_photo_path text,
  submitted_on date,
  homepage_featured boolean,
  homepage_feature_order integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    submission.id,
    species.common_name,
    species.slug,
    coalesce(nullif(profile.display_name, ''), profile.username),
    case when profile.show_instagram_on_catches then profile.instagram_handle else null end,
    submission.length_cm,
    submission.story,
    submission.public_photo_path,
    submission.created_at::date,
    submission.homepage_featured,
    submission.homepage_feature_order
  from public.submissions submission
  join public.species species on species.id = submission.species_id
  join public.profiles profile on profile.id = submission.user_id
  where submission.kind = 'catch'
    and submission.status = 'approved'
    and submission.length_verified = true
    and submission.public_photo_path is not null
  order by
    submission.homepage_featured desc,
    submission.homepage_feature_order asc nulls last,
    coalesce(submission.reviewed_at, submission.created_at) desc
  limit least(greatest(coalesce(target_limit, 8), 1), 24);
$$;

create or replace function public.get_catch_feature_settings()
returns table (
  submission_id uuid,
  homepage_featured boolean,
  homepage_feature_order integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  select submission.id, submission.homepage_featured, submission.homepage_feature_order
  from public.submissions submission
  where submission.kind = 'catch' and submission.status = 'approved';
end;
$$;

create or replace function public.set_catch_homepage_feature(
  target_submission_id uuid,
  target_featured boolean,
  target_order integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.submissions
  set
    homepage_featured = coalesce(target_featured, false),
    homepage_feature_order = case when target_featured then greatest(coalesce(target_order, 1), 1) else null end
  where id = target_submission_id
    and kind = 'catch'
    and status = 'approved'
    and public_photo_path is not null;

  if not found then
    raise exception 'Only approved catches with a public hero photo can be featured';
  end if;
end;
$$;

revoke all on function public.get_homepage_showcase(integer) from public;
revoke all on function public.get_catch_feature_settings() from public;
revoke all on function public.set_catch_homepage_feature(uuid, boolean, integer) from public;
grant execute on function public.get_homepage_showcase(integer) to anon, authenticated;
grant execute on function public.get_catch_feature_settings() to authenticated;
grant execute on function public.set_catch_homepage_feature(uuid, boolean, integer) to authenticated;
