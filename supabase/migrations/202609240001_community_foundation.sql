-- Spearfishing Victoria community foundation.
-- Public browsing is open; member actions require authentication; moderation
-- controls what becomes public. Exact dive locations are deliberately absent.

create extension if not exists pgcrypto;

create type public.member_role as enum ('member', 'moderator', 'admin');
create type public.content_status as enum ('pending', 'approved', 'rejected');
create type public.submission_kind as enum ('catch', 'recipe', 'community');
create type public.challenge_status as enum ('draft', 'active', 'closed');
create type public.ballot_status as enum ('draft', 'open', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  emergency_contact_name text,
  emergency_contact_phone text,
  qualifications text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.species (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  common_name text not null unique,
  scientific_name text,
  summary text,
  authority_url text,
  hero_image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  species_id uuid not null references public.species(id),
  title text not null,
  description text,
  starts_on date not null,
  ends_on date not null,
  status public.challenge_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete set null,
  species_id uuid references public.species(id) on delete set null,
  kind public.submission_kind not null,
  title text not null check (char_length(title) between 3 and 100),
  story text not null check (char_length(story) between 10 and 3000),
  broad_region text not null check (broad_region in (
    'Port Phillip Bay',
    'Mornington Peninsula',
    'Bass Coast',
    'Surf Coast',
    'Wilsons Promontory',
    'Other Victoria'
  )),
  activity_date date,
  length_cm numeric(5,1) check (length_cm is null or length_cm > 0),
  photo_path text,
  status public.content_status not null default 'pending',
  moderation_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  prep_minutes integer check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes integer check (cook_minutes is null or cook_minutes >= 0),
  serves integer check (serves is null or serves > 0),
  ingredients text[] not null default '{}',
  method text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status public.ballot_status not null default 'draft',
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table public.ballot_options (
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  species_id uuid not null references public.species(id) on delete cascade,
  primary key (ballot_id, species_id)
);

create table public.species_votes (
  ballot_id uuid not null,
  species_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ballot_id, user_id),
  foreign key (ballot_id, species_id)
    references public.ballot_options(ballot_id, species_id)
    on delete cascade
);

create table public.point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 120),
  points integer not null check (points between -1000 and 1000),
  awarded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger member_details_set_updated_at before update on public.member_details
for each row execute function public.set_updated_at();
create trigger species_set_updated_at before update on public.species
for each row execute function public.set_updated_at();
create trigger challenges_set_updated_at before update on public.challenges
for each row execute function public.set_updated_at();
create trigger submissions_set_updated_at before update on public.submissions
for each row execute function public.set_updated_at();
create trigger recipes_set_updated_at before update on public.recipes
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'member-' || left(new.id::text, 8),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', 'New member')
  );
  insert into public.member_details (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('moderator', 'admin')
  );
$$;

create view public.species_vote_totals
with (security_invoker = false)
as
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
  on vote.ballot_id = option.ballot_id and vote.species_id = option.species_id
group by option.ballot_id, option.species_id, species.slug, species.common_name;

create view public.challenge_leaderboard
with (security_invoker = false)
as
select
  points.challenge_id,
  points.user_id,
  profile.username,
  profile.display_name,
  profile.avatar_url,
  sum(points.points)::integer as points
from public.point_events points
join public.challenges challenge
  on challenge.id = points.challenge_id
  and challenge.status in ('active', 'closed')
join public.profiles profile on profile.id = points.user_id
group by points.challenge_id, points.user_id, profile.username, profile.display_name, profile.avatar_url;

alter table public.profiles enable row level security;
alter table public.member_details enable row level security;
alter table public.species enable row level security;
alter table public.challenges enable row level security;
alter table public.submissions enable row level security;
alter table public.recipes enable row level security;
alter table public.ballots enable row level security;
alter table public.ballot_options enable row level security;
alter table public.species_votes enable row level security;
alter table public.point_events enable row level security;

create policy "Profiles are publicly readable" on public.profiles for select using (true);
create policy "Members update their own profile" on public.profiles for update
using (id = auth.uid()) with check (id = auth.uid());
create policy "Staff manage profiles" on public.profiles for all
using (public.is_staff()) with check (public.is_staff());

create policy "Members read their private details" on public.member_details for select
using (user_id = auth.uid() or public.is_staff());
create policy "Members update their private details" on public.member_details for update
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Staff manage private details" on public.member_details for all
using (public.is_staff()) with check (public.is_staff());

create policy "Species are publicly readable" on public.species for select using (is_active or public.is_staff());
create policy "Staff manage species" on public.species for all
using (public.is_staff()) with check (public.is_staff());

create policy "Active challenges are publicly readable" on public.challenges for select
using (status in ('active', 'closed') or public.is_staff());
create policy "Staff manage challenges" on public.challenges for all
using (public.is_staff()) with check (public.is_staff());

create policy "Approved submissions are public and owners see their own" on public.submissions for select
using (status = 'approved' or user_id = auth.uid() or public.is_staff());
create policy "Members create pending submissions" on public.submissions for insert
with check (user_id = auth.uid() and status = 'pending');
create policy "Members edit their pending submissions" on public.submissions for update
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid() and status = 'pending');
create policy "Members remove their pending submissions" on public.submissions for delete
using (user_id = auth.uid() and status = 'pending');
create policy "Staff moderate submissions" on public.submissions for all
using (public.is_staff()) with check (public.is_staff());

create policy "Approved recipes are public and owners see their own" on public.recipes for select
using (exists (
  select 1 from public.submissions submission
  where submission.id = submission_id
    and (submission.status = 'approved' or submission.user_id = auth.uid() or public.is_staff())
));
create policy "Members create recipes for pending submissions" on public.recipes for insert
with check (exists (
  select 1 from public.submissions submission
  where submission.id = submission_id and submission.user_id = auth.uid() and submission.status = 'pending'
));
create policy "Members edit recipes for pending submissions" on public.recipes for update
using (exists (
  select 1 from public.submissions submission
  where submission.id = submission_id and submission.user_id = auth.uid() and submission.status = 'pending'
)) with check (exists (
  select 1 from public.submissions submission
  where submission.id = submission_id and submission.user_id = auth.uid() and submission.status = 'pending'
));
create policy "Staff manage recipes" on public.recipes for all
using (public.is_staff()) with check (public.is_staff());

create policy "Open ballots are publicly readable" on public.ballots for select
using (status in ('open', 'closed') or public.is_staff());
create policy "Staff manage ballots" on public.ballots for all
using (public.is_staff()) with check (public.is_staff());
create policy "Ballot options are publicly readable" on public.ballot_options for select using (true);
create policy "Staff manage ballot options" on public.ballot_options for all
using (public.is_staff()) with check (public.is_staff());

create policy "Members read their own vote" on public.species_votes for select
using (user_id = auth.uid() or public.is_staff());
create policy "Members cast an open ballot vote" on public.species_votes for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.ballots ballot
    where ballot.id = ballot_id
      and ballot.status = 'open'
      and now() between ballot.opens_at and ballot.closes_at
  )
);
create policy "Members change their open ballot vote" on public.species_votes for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.ballots ballot
    where ballot.id = ballot_id
      and ballot.status = 'open'
      and now() between ballot.opens_at and ballot.closes_at
  )
);
create policy "Staff manage votes" on public.species_votes for all
using (public.is_staff()) with check (public.is_staff());

create policy "Members read their point events" on public.point_events for select
using (user_id = auth.uid() or public.is_staff());
create policy "Staff manage point events" on public.point_events for all
using (public.is_staff()) with check (public.is_staff());

revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, bio) on public.profiles to authenticated;
revoke update on public.submissions from authenticated;
grant update (challenge_id, species_id, kind, title, story, broad_region, activity_date, length_cm, photo_path)
on public.submissions to authenticated;

grant select on public.species_vote_totals to anon, authenticated;
grant select on public.challenge_leaderboard to anon, authenticated;

insert into public.species (slug, common_name, scientific_name, authority_url)
values
  ('snapper', 'Snapper', 'Chrysophrys auratus', 'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/marine-and-estuarine-scale-fish/snapper'),
  ('king-george-whiting', 'King George whiting', 'Sillaginodes punctatus', null),
  ('southern-calamari', 'Southern calamari', 'Sepioteuthis australis', null),
  ('yellowtail-kingfish', 'Yellowtail kingfish', 'Seriola lalandi', null)
on conflict (slug) do update set
  common_name = excluded.common_name,
  scientific_name = excluded.scientific_name,
  authority_url = excluded.authority_url;
