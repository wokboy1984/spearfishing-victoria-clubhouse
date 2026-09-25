-- Match table privileges to the Row Level Security policies.
-- RLS remains the final gate for every row returned or changed.

grant select on table
  public.profiles,
  public.member_details,
  public.species,
  public.challenges,
  public.submissions,
  public.recipes,
  public.ballots,
  public.ballot_options,
  public.species_votes,
  public.point_events
to anon, authenticated;

grant insert on table
  public.submissions,
  public.recipes,
  public.species_votes
to authenticated;

grant update on table
  public.member_details,
  public.recipes,
  public.species_votes
to authenticated;

grant insert, update on table
  public.species,
  public.challenges,
  public.ballots,
  public.ballot_options,
  public.point_events
to authenticated;
