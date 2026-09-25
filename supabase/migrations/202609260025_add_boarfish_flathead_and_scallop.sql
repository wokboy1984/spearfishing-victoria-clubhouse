-- Add the next three curated species to member submissions and recipes.

insert into public.species (slug, common_name, scientific_name, authority_url)
values
  (
    'boarfish',
    'Boarfish',
    'Pentacerotidae',
    'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/marine-and-estuarine-scale-fish/boarfish-all-species'
  ),
  (
    'flathead',
    'Flathead',
    'Platycephalidae',
    'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/marine-and-estuarine-scale-fish/flathead-all-species-except-dusky-flathead'
  ),
  (
    'scallop',
    'Scallop',
    'Pecten fumatus',
    'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/shellfish/scallop'
  )
on conflict (slug) do update set
  common_name = excluded.common_name,
  scientific_name = excluded.scientific_name,
  authority_url = excluded.authority_url,
  is_active = true;
