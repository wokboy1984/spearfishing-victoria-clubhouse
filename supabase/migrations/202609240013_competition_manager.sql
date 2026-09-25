-- Staff-managed monthly program. Challenge and ballot changes are saved in one
-- transaction so the homepage never receives a half-configured competition.

create or replace function public.get_staff_programs()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  return jsonb_build_object(
    'species', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', common_name) order by common_name), '[]'::jsonb) from public.species where is_active),
    'challenges', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'species_id', c.species_id, 'title', c.title, 'description', c.description, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'status', c.status) order by c.starts_on desc), '[]'::jsonb) from public.challenges c),
    'ballots', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'opens_at', b.opens_at, 'closes_at', b.closes_at, 'status', b.status, 'species_ids', coalesce((select jsonb_agg(o.species_id) from public.ballot_options o where o.ballot_id = b.id), '[]'::jsonb)) order by b.opens_at desc), '[]'::jsonb) from public.ballots b)
  );
end;
$$;

create or replace function public.save_monthly_program(
  target_challenge_id uuid,
  target_species_id uuid,
  target_challenge_title text,
  target_description text,
  target_starts_on date,
  target_ends_on date,
  target_challenge_status public.challenge_status,
  target_ballot_id uuid,
  target_ballot_title text,
  target_opens_at timestamptz,
  target_closes_at timestamptz,
  target_ballot_status public.ballot_status,
  target_ballot_species_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_challenge_id uuid;
  saved_ballot_id uuid;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if target_ends_on < target_starts_on then raise exception 'Challenge closing date must be after its start date'; end if;
  if target_closes_at <= target_opens_at then raise exception 'Voting close time must be after its opening time'; end if;
  if coalesce(array_length(target_ballot_species_ids, 1), 0) < 2 then raise exception 'Choose at least two voting candidates'; end if;

  if target_challenge_status = 'active' then
    update public.challenges set status = 'closed'
    where status = 'active' and id is distinct from target_challenge_id;
  end if;
  if target_ballot_status = 'open' then
    update public.ballots set status = 'closed'
    where status = 'open' and id is distinct from target_ballot_id;
  end if;

  if target_challenge_id is null then
    insert into public.challenges (species_id, title, description, starts_on, ends_on, status)
    values (target_species_id, trim(target_challenge_title), nullif(trim(target_description), ''), target_starts_on, target_ends_on, target_challenge_status)
    returning id into saved_challenge_id;
  else
    update public.challenges set species_id = target_species_id, title = trim(target_challenge_title), description = nullif(trim(target_description), ''), starts_on = target_starts_on, ends_on = target_ends_on, status = target_challenge_status
    where id = target_challenge_id returning id into saved_challenge_id;
    if saved_challenge_id is null then raise exception 'Challenge not found'; end if;
  end if;

  if target_ballot_id is null then
    insert into public.ballots (title, opens_at, closes_at, status)
    values (trim(target_ballot_title), target_opens_at, target_closes_at, target_ballot_status)
    returning id into saved_ballot_id;
  else
    update public.ballots set title = trim(target_ballot_title), opens_at = target_opens_at, closes_at = target_closes_at, status = target_ballot_status
    where id = target_ballot_id returning id into saved_ballot_id;
    if saved_ballot_id is null then raise exception 'Ballot not found'; end if;
  end if;

  delete from public.ballot_options where ballot_id = saved_ballot_id and not (species_id = any(target_ballot_species_ids));
  insert into public.ballot_options (ballot_id, species_id)
  select saved_ballot_id, candidate from unnest(target_ballot_species_ids) candidate
  on conflict do nothing;

  return jsonb_build_object('challenge_id', saved_challenge_id, 'ballot_id', saved_ballot_id);
end;
$$;

revoke all on function public.get_staff_programs() from public;
revoke all on function public.save_monthly_program(uuid, uuid, text, text, date, date, public.challenge_status, uuid, text, timestamptz, timestamptz, public.ballot_status, uuid[]) from public;
grant execute on function public.get_staff_programs() to authenticated;
grant execute on function public.save_monthly_program(uuid, uuid, text, text, date, date, public.challenge_status, uuid, text, timestamptz, timestamptz, public.ballot_status, uuid[]) to authenticated;

