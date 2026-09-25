-- Seed the first live monthly challenge and community species ballot.

insert into public.challenges (species_id, title, description, starts_on, ends_on, status)
select
  species.id,
  'September 2026 Snapper Challenge',
  'Points reward responsible catches, recipes and helpful community contributions.',
  date '2026-09-01',
  date '2026-09-30',
  'active'
from public.species species
where species.slug = 'snapper'
  and not exists (
    select 1 from public.challenges challenge
    where challenge.title = 'September 2026 Snapper Challenge'
  );

insert into public.ballots (title, opens_at, closes_at, status)
select
  'October 2026 Species of the Month',
  timestamptz '2026-09-01 00:00:00+10',
  timestamptz '2026-10-01 00:00:00+10',
  'open'
where not exists (
  select 1 from public.ballots ballot
  where ballot.title = 'October 2026 Species of the Month'
);

insert into public.ballot_options (ballot_id, species_id)
select ballot.id, species.id
from public.ballots ballot
join public.species species on species.slug in (
  'king-george-whiting',
  'southern-calamari',
  'yellowtail-kingfish'
)
where ballot.title = 'October 2026 Species of the Month'
on conflict do nothing;
