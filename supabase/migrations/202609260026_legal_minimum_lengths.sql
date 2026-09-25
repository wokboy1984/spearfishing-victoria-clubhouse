alter table public.species
  add column if not exists minimum_legal_length_cm numeric(5,1)
  check (minimum_legal_length_cm is null or minimum_legal_length_cm > 0);

-- TODO: verify against VFA before enabling
update public.species
set minimum_legal_length_cm = null;

update public.species
set minimum_legal_length_cm = 28
where slug = 'snapper';

create or replace function public.enforce_catch_minimum_legal_length()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  species_name text;
  minimum_length numeric;
begin
  if new.kind <> 'catch' then
    return new;
  end if;

  select species.common_name, species.minimum_legal_length_cm
  into species_name, minimum_length
  from public.species species
  where species.id = new.species_id;

  if minimum_length is not null and new.length_cm < minimum_length then
    raise exception 'Below the % cm legal minimum for %', minimum_length, species_name;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_catch_minimum_legal_length on public.submissions;
create trigger enforce_catch_minimum_legal_length
before insert or update of species_id, length_cm, kind on public.submissions
for each row execute function public.enforce_catch_minimum_legal_length();
