-- Private catch-photo submissions, Victoria/recent-catch attestations and
-- optional Instagram attribution for approved community features.

alter table public.profiles
  add column instagram_handle text,
  add column show_instagram_on_catches boolean not null default false,
  add constraint instagram_handle_format check (
    instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'
  );

alter table public.submissions
  alter column broad_region drop not null,
  add column caught_in_victoria boolean not null default false,
  add column caught_within_last_week boolean not null default false,
  add column rules_accepted_at timestamptz;

create type public.submission_photo_kind as enum ('measurement', 'hero', 'extra');

create table public.submission_photos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  kind public.submission_photo_kind not null,
  storage_path text not null unique,
  display_order smallint not null check (display_order between 1 and 3),
  created_at timestamptz not null default now(),
  unique (submission_id, kind),
  unique (submission_id, display_order)
);

alter table public.submission_photos enable row level security;

create policy "Approved submission photos are public and owners see their own"
on public.submission_photos for select
using (exists (
  select 1 from public.submissions submission
  where submission.id = submission_id
    and (submission.status = 'approved' or submission.user_id = auth.uid() or public.is_staff())
));

create policy "Staff manage submission photos"
on public.submission_photos for all
using (public.is_staff()) with check (public.is_staff());

grant select on table public.submission_photos to anon, authenticated;
grant update (instagram_handle, show_instagram_on_catches) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('submission-photos', 'submission-photos', false, 12582912, array['image/jpeg', 'image/png', 'image/webp']),
  ('community-images', 'community-images', true, 12582912, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Members upload their own pending photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'submission-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Members read their own pending photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'submission-photos'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
);

create policy "Members remove their own pending photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'submission-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Published community images are public"
on storage.objects for select
using (bucket_id = 'community-images');

create policy "Staff manage published community images"
on storage.objects for all to authenticated
using (bucket_id = 'community-images' and public.is_staff())
with check (bucket_id = 'community-images' and public.is_staff());

create function public.create_catch_submission(
  target_submission_id uuid,
  target_species_id uuid,
  target_length_cm numeric,
  target_story text,
  measurement_photo_path text,
  hero_photo_path text,
  extra_photo_path text default null,
  confirmed_victoria boolean default false,
  confirmed_recent boolean default false,
  confirmed_rules boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
  species_name text;
  active_challenge_id uuid;
begin
  if member_id is null then
    raise exception 'Sign in is required';
  end if;
  if not confirmed_victoria or not confirmed_recent or not confirmed_rules then
    raise exception 'All entry confirmations are required';
  end if;
  if target_length_cm is null or target_length_cm <= 0 or target_length_cm > 999.9 then
    raise exception 'Enter a valid measured length';
  end if;
  if char_length(trim(target_story)) < 10 or char_length(trim(target_story)) > 1000 then
    raise exception 'Catch story must be between 10 and 1000 characters';
  end if;
  if measurement_photo_path is null or hero_photo_path is null
    or measurement_photo_path not like member_id::text || '/%'
    or hero_photo_path not like member_id::text || '/%'
    or (extra_photo_path is not null and extra_photo_path not like member_id::text || '/%') then
    raise exception 'Photo paths must belong to the signed-in member';
  end if;

  select species.common_name into species_name
  from public.species species
  where species.id = target_species_id and species.is_active = true;
  if species_name is null then
    raise exception 'Choose an active tracked species';
  end if;

  select challenge.id into active_challenge_id
  from public.challenges challenge
  where challenge.species_id = target_species_id
    and challenge.status = 'active'
    and current_date between challenge.starts_on and challenge.ends_on
  order by challenge.starts_on desc
  limit 1;

  insert into public.submissions (
    id, user_id, challenge_id, species_id, kind, title, story,
    broad_region, activity_date, length_cm, photo_path, status,
    caught_in_victoria, caught_within_last_week, rules_accepted_at
  ) values (
    target_submission_id, member_id, active_challenge_id, target_species_id,
    'catch', species_name || ' catch', trim(target_story), null, null,
    target_length_cm, hero_photo_path, 'pending', true, true, now()
  );

  insert into public.submission_photos (submission_id, kind, storage_path, display_order)
  values
    (target_submission_id, 'measurement', measurement_photo_path, 1),
    (target_submission_id, 'hero', hero_photo_path, 2);

  if extra_photo_path is not null then
    insert into public.submission_photos (submission_id, kind, storage_path, display_order)
    values (target_submission_id, 'extra', extra_photo_path, 3);
  end if;

  return target_submission_id;
end;
$$;

revoke all on function public.create_catch_submission(uuid, uuid, numeric, text, text, text, text, boolean, boolean, boolean) from public;
grant execute on function public.create_catch_submission(uuid, uuid, numeric, text, text, text, text, boolean, boolean, boolean) to authenticated;

create or replace function public.get_challenge_catch_leaderboard(target_challenge_id uuid default null)
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
      and submission.caught_in_victoria = true
      and submission.caught_within_last_week = true
      and submission.created_at::date between challenge.starts_on and challenge.ends_on
    where challenge.status in ('active', 'closed')
      and (target_challenge_id is null or challenge.id = target_challenge_id)
  ),
  best_entries as (
    select * from eligible where member_entry = 1
  ),
  ranked as (
    select
      best_entries.*,
      rank() over (partition by challenge_id order by length_cm desc)::integer as placement
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

create or replace function public.get_all_species_cup(target_year integer default extract(year from current_date)::integer)
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
      and submission.caught_in_victoria = true
      and submission.caught_within_last_week = true
      and extract(year from submission.created_at)::integer = target_year
  ),
  ranked as (
    select
      eligible.*,
      rank() over (partition by species_id order by length_cm desc)::integer as placement
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
