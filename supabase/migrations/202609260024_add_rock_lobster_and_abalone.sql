-- Add the two newly tracked Victorian species to member submissions and recipes.

insert into public.species (slug, common_name, scientific_name, authority_url)
values
  (
    'rock-lobster',
    'Southern rock lobster',
    'Jasus edwardsii',
    'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/rock-lobster-all-species'
  ),
  (
    'abalone',
    'Abalone',
    'Haliotis species',
    'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/shellfish/abalone-all-species'
  )
on conflict (slug) do update set
  common_name = excluded.common_name,
  scientific_name = excluded.scientific_name,
  authority_url = excluded.authority_url,
  is_active = true;
