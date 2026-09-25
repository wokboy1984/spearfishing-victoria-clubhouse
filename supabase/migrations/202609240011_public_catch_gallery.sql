-- Public catch cards for species pages. Only the moderator-published hero image
-- is returned; private measurement and extra photos remain inaccessible.

create function public.get_species_catches(
  target_species_slug text,
  target_period text default 'month',
  result_limit integer default 24
)
returns table (
  species_id uuid,
  submission_id uuid,
  user_id uuid,
  username text,
  display_name text,
  instagram_handle text,
  best_length_cm numeric,
  submitted_on date,
  rank integer,
  story text,
  public_photo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      submission.species_id,
      submission.id as submission_id,
      submission.user_id,
      submission.length_cm,
      submission.created_at::date as submitted_on,
      submission.story,
      submission.public_photo_path,
      row_number() over (
        partition by submission.user_id
        order by submission.length_cm desc, submission.created_at asc
      ) as member_entry
    from public.submissions submission
    join public.species species
      on species.id = submission.species_id
      and species.slug = target_species_slug
      and species.is_active = true
    where submission.kind = 'catch'
      and submission.status = 'approved'
      and submission.length_verified = true
      and submission.caught_in_victoria = true
      and submission.caught_within_last_week = true
      and submission.public_photo_path is not null
      and case target_period
        when 'month' then submission.created_at >= date_trunc('month', current_date)
        when 'year' then submission.created_at >= date_trunc('year', current_date)
        when 'overall' then true
        else false
      end
  ),
  ranked as (
    select
      eligible.*,
      rank() over (order by length_cm desc)::integer as placement
    from eligible
    where member_entry = 1
  )
  select
    ranked.species_id,
    ranked.submission_id,
    ranked.user_id,
    profile.username,
    profile.display_name,
    case when profile.show_instagram_on_catches then profile.instagram_handle else null end,
    ranked.length_cm,
    ranked.submitted_on,
    ranked.placement,
    ranked.story,
    ranked.public_photo_path
  from ranked
  join public.profiles profile on profile.id = ranked.user_id
  order by ranked.placement, profile.display_name
  limit greatest(1, least(coalesce(result_limit, 24), 50));
$$;

revoke all on function public.get_species_catches(text, text, integer) from public;
grant execute on function public.get_species_catches(text, text, integer) to anon, authenticated;
