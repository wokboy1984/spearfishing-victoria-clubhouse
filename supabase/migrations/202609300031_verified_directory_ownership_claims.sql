-- Ownership approval is a privileged access decision. Collect structured,
-- independently verifiable evidence and enforce the moderator checks in SQL.

alter table public.directory_claims
  add column if not exists claimant_role text,
  add column if not exists business_email text,
  add column if not exists verification_url text,
  add column if not exists contact_consent boolean not null default false,
  add column if not exists verification_record jsonb;

drop function if exists public.claim_directory_listing(text,text);
create or replace function public.claim_directory_listing(
  listing_slug text,
  claim_role text,
  claim_business_email text,
  claim_verification_url text,
  request_details text,
  claim_contact_consent boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid(); listing_id uuid; claim_id uuid;
begin
  if member_id is null then raise exception 'Sign in is required'; end if;
  if char_length(trim(claim_role)) < 2 then raise exception 'Your role or position is required'; end if;
  if claim_business_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid organisation email'; end if;
  if claim_verification_url !~* '^https://[^[:space:]]+$' then raise exception 'Provide a secure public verification page'; end if;
  if char_length(trim(request_details)) < 30 then raise exception 'Explain how your authority can be verified (at least 30 characters)'; end if;
  if claim_contact_consent is not true then raise exception 'Consent to independent verification is required'; end if;
  select id into listing_id from public.directory_listings where slug=listing_slug and status='approved' and owner_id is null;
  if listing_id is null then raise exception 'This listing is unavailable or already has a verified owner'; end if;
  insert into public.directory_claims(listing_id,member_id,evidence,claimant_role,business_email,verification_url,contact_consent)
  values(listing_id,member_id,trim(request_details),trim(claim_role),lower(trim(claim_business_email)),trim(claim_verification_url),true)
  returning id into claim_id;
  return claim_id;
end $$;

create or replace function public.get_directory_moderation_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  select jsonb_build_object(
    'listings',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.directory_listings l where l.status='pending'),'[]'::jsonb),
    'published',coalesce((select jsonb_agg(to_jsonb(l) order by l.name) from public.directory_listings l where l.status='approved'),'[]'::jsonb),
    'claims',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('listing',to_jsonb(l),'claimant',jsonb_build_object('username',p.username,'display_name',p.display_name,'created_at',p.created_at)) order by c.created_at) from public.directory_claims c join public.directory_listings l on l.id=c.listing_id join public.profiles p on p.id=c.member_id where c.status='pending'),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('listing',to_jsonb(l)) order by r.created_at) from public.directory_reports r join public.directory_listings l on l.id=r.listing_id where r.status='open'),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.moderate_directory_claim(
  claim_id uuid,
  claim_decision text,
  moderator_note text,
  contact_checked boolean,
  authority_confirmed boolean,
  scope_checked boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_listing_id uuid; v_member_id uuid;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if claim_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  if claim_decision='approved' and not (contact_checked and authority_confirmed and scope_checked) then
    raise exception 'Complete all independent verification checks before approval';
  end if;
  select c.listing_id,c.member_id into v_listing_id,v_member_id from public.directory_claims c where c.id=claim_id and c.status='pending' for update;
  if v_listing_id is null then raise exception 'Claim is no longer awaiting review'; end if;
  if claim_decision='approved' and exists(select 1 from public.directory_listings where id=v_listing_id and owner_id is not null) then
    raise exception 'This listing already has a verified owner';
  end if;
  update public.directory_claims set
    status=claim_decision,
    moderation_note=nullif(trim(moderator_note),''),
    verification_record=jsonb_build_object('independent_contact_checked',contact_checked,'authority_confirmed',authority_confirmed,'scope_checked',scope_checked,'verified_at',now(),'verified_by',auth.uid()),
    reviewed_by=auth.uid(),reviewed_at=now()
  where id=claim_id and status='pending';
  if claim_decision='approved' then
    update public.directory_listings set owner_id=v_member_id,owner_verified_at=now(),updated_at=now() where id=v_listing_id and owner_id is null;
    if not found then raise exception 'Ownership changed while this claim was being reviewed'; end if;
    update public.directory_claims set status='rejected',moderation_note='Another verified claim was approved first',reviewed_by=auth.uid(),reviewed_at=now()
      where listing_id=v_listing_id and id<>claim_id and status='pending';
  end if;
end $$;

-- Keep the general moderation endpoint for listings and reports, but do not let
-- older clients bypass the claim-specific verification guard.
create or replace function public.moderate_directory_item(item_kind text,item_id uuid,item_decision text,moderator_note text default null) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if item_kind='listings' then
    if item_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
    update public.directory_listings set status=item_decision,moderation_note=nullif(trim(moderator_note),''),reviewed_by=auth.uid(),reviewed_at=now(),owner_id=case when item_decision='approved' then submitted_by else owner_id end,owner_verified_at=case when item_decision='approved' then now() else owner_verified_at end,updated_at=now() where id=item_id and status='pending';
  elsif item_kind='reports' then
    update public.directory_reports set status=case when item_decision='approved' then 'resolved' else 'dismissed' end,resolved_by=auth.uid(),resolved_at=now() where id=item_id and status='open';
  elsif item_kind='claims' then
    raise exception 'Ownership claims require the verified approval workflow';
  else
    raise exception 'Invalid item type';
  end if;
  if not found then raise exception 'Item is no longer awaiting review'; end if;
end $$;

revoke all on function public.claim_directory_listing(text,text,text,text,text,boolean) from public;
grant execute on function public.claim_directory_listing(text,text,text,text,text,boolean) to authenticated;
revoke all on function public.moderate_directory_claim(uuid,text,text,boolean,boolean,boolean) from public;
grant execute on function public.moderate_directory_claim(uuid,text,text,boolean,boolean,boolean) to authenticated;
