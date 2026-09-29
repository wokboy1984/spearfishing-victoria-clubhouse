-- Let verified owners update the structured service areas shown on their listing.

drop function if exists public.update_owned_directory_listing(uuid,text,text,text,text[]);

create or replace function public.update_owned_directory_listing(
  listing_id uuid,
  listing_description text,
  listing_region text,
  listing_service_area text,
  listing_website text,
  listing_services text[]
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare listing_category text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select category into listing_category from public.directory_listings where id=listing_id and owner_id=auth.uid() and status='approved';
  if listing_category is null then raise exception 'Only the verified owner can update an approved listing'; end if;
  if listing_category not in ('Instagram Accounts','YouTube Channels') and nullif(trim(listing_service_area),'') is null then raise exception 'Choose at least one service area'; end if;

  update public.directory_listings set
    description=trim(listing_description),
    region=trim(listing_region),
    service_area=nullif(trim(listing_service_area),''),
    website=nullif(trim(listing_website),''),
    services=coalesce(listing_services,'{}'),
    updated_at=now()
  where id=listing_id and owner_id=auth.uid() and status='approved';

end
$$;

revoke all on function public.update_owned_directory_listing(uuid,text,text,text,text,text[]) from public;
grant execute on function public.update_owned_directory_listing(uuid,text,text,text,text,text[]) to authenticated;
