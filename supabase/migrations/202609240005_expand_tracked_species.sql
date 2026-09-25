-- Add Southern bluefin tuna to the curated tracked-species set and correct
-- the King George whiting scientific name.

update public.species
set scientific_name = 'Sillaginodes punctata'
where slug = 'king-george-whiting';

insert into public.species (slug, common_name, scientific_name, authority_url)
values (
  'southern-bluefin-tuna',
  'Southern bluefin tuna',
  'Thunnus maccoyii',
  'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/marine-and-estuarine-scale-fish/tuna-southern-bluefin-yellowfin-and-big-eye'
)
on conflict (slug) do update set
  common_name = excluded.common_name,
  scientific_name = excluded.scientific_name,
  authority_url = excluded.authority_url;
