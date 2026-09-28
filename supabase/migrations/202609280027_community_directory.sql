-- Public community directory with moderated submissions, verified ownership,
-- recommendations and member reports.

create table if not exists public.directory_listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 100),
  category text not null check (category in ('Freediving Schools','Clubs','Spearfishing Stores','Spearfishing Charters','YouTube Channels','Instagram Accounts','Underwater Sports')),
  categories text[] not null default '{}',
  region text not null,
  location text,
  service_area text,
  description text not null check (char_length(description) between 20 and 900),
  services text[] not null default '{}',
  website text,
  instagram_url text,
  youtube_url text,
  contact_email text,
  phone text,
  logo_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
  owner_id uuid references public.profiles(id) on delete set null,
  owner_verified_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  ownership_evidence text,
  moderation_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.directory_listings add column if not exists categories text[] not null default '{}';
update public.directory_listings set categories=array[category] where cardinality(categories)=0;

create table if not exists public.directory_claims (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.directory_listings(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  evidence text not null check (char_length(evidence) between 10 and 600),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  moderation_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, member_id, status)
);

create table if not exists public.directory_recommendations (
  listing_id uuid not null references public.directory_listings(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  note text check (char_length(note) <= 600),
  created_at timestamptz not null default now(),
  primary key (listing_id, member_id)
);

create table if not exists public.directory_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.directory_listings(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  details text not null check (char_length(details) between 10 and 600),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.directory_listings enable row level security;
alter table public.directory_claims enable row level security;
alter table public.directory_recommendations enable row level security;
alter table public.directory_reports enable row level security;

create policy "Public reads approved directory listings" on public.directory_listings for select using (status = 'approved' or owner_id = auth.uid() or submitted_by = auth.uid() or public.is_staff());
create policy "Owners update approved listings" on public.directory_listings for update using (owner_id = auth.uid() and status = 'approved') with check (owner_id = auth.uid() and status = 'approved');
create policy "Members read own claims" on public.directory_claims for select using (member_id = auth.uid() or public.is_staff());
create policy "Members read own recommendations" on public.directory_recommendations for select using (member_id = auth.uid() or exists(select 1 from public.directory_listings l where l.id=listing_id and l.status='approved'));
create policy "Members read own reports" on public.directory_reports for select using (member_id = auth.uid() or public.is_staff());

create or replace function public.directory_slug(value text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(trim(value)), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.submit_directory_listing(listing_name text, listing_category text, listing_region text, listing_location text, listing_service_area text, listing_website text, listing_description text, listing_services text[], listing_contact_email text, listing_phone text, listing_social_url text, listing_logo_url text, ownership_evidence text)
returns uuid language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid(); new_id uuid; base_slug text; final_slug text; suffix integer:=1;
begin
  if member_id is null then raise exception 'Sign in is required'; end if;
  if listing_category not in ('Freediving Schools','Clubs','Spearfishing Stores','Spearfishing Charters','YouTube Channels','Instagram Accounts','Underwater Sports') then raise exception 'Choose a valid category'; end if;
  if char_length(trim(ownership_evidence))<10 then raise exception 'Ownership evidence is required'; end if;
  base_slug:=public.directory_slug(listing_name); final_slug:=base_slug;
  while exists(select 1 from public.directory_listings where slug=final_slug) loop suffix:=suffix+1; final_slug:=base_slug||'-'||suffix; end loop;
  insert into public.directory_listings(slug,name,category,categories,region,location,service_area,description,services,website,contact_email,phone,instagram_url,youtube_url,logo_path,status,submitted_by,ownership_evidence)
  values(final_slug,trim(listing_name),listing_category,array[listing_category],trim(listing_region),trim(listing_location),trim(listing_service_area),trim(listing_description),coalesce(listing_services,'{}'),nullif(trim(listing_website),''),nullif(trim(listing_contact_email),''),nullif(trim(listing_phone),''),case when listing_social_url ilike '%instagram.com%' then listing_social_url end,case when listing_social_url ilike '%youtu%' then listing_social_url end,nullif(trim(listing_logo_url),''),'pending',member_id,trim(ownership_evidence)) returning id into new_id;
  return new_id;
end $$;

create or replace function public.claim_directory_listing(listing_slug text, request_details text) returns uuid language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid(); listing_id uuid; claim_id uuid;
begin
  if member_id is null then raise exception 'Sign in is required'; end if;
  select id into listing_id from public.directory_listings where slug=listing_slug and status='approved';
  if listing_id is null then raise exception 'Listing not found'; end if;
  insert into public.directory_claims(listing_id,member_id,evidence) values(listing_id,member_id,trim(request_details)) returning id into claim_id;
  return claim_id;
end $$;

create or replace function public.recommend_directory_listing(listing_slug text, recommendation_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid(); listing_id uuid;
begin
  if member_id is null then raise exception 'Sign in is required'; end if;
  select id into listing_id from public.directory_listings where slug=listing_slug and status='approved';
  if listing_id is null then raise exception 'Listing not found'; end if;
  insert into public.directory_recommendations(listing_id,member_id,note) values(listing_id,member_id,nullif(trim(recommendation_note),'')) on conflict(listing_id,member_id) do update set note=excluded.note,created_at=now();
end $$;

create or replace function public.report_directory_listing(listing_slug text, request_details text) returns uuid language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid(); listing_id uuid; report_id uuid;
begin
  if member_id is null then raise exception 'Sign in is required'; end if;
  select id into listing_id from public.directory_listings where slug=listing_slug and status='approved';
  if listing_id is null then raise exception 'Listing not found'; end if;
  insert into public.directory_reports(listing_id,member_id,details) values(listing_id,member_id,trim(request_details)) returning id into report_id;
  return report_id;
end $$;

drop function if exists public.get_public_directory();
create or replace function public.get_public_directory() returns table(id uuid,slug text,name text,category text,categories text[],region text,location text,service_area text,description text,services text[],website text,instagram_url text,youtube_url text,contact_email text,phone text,logo_path text,owner_verified boolean,last_updated timestamptz,recommendation_count bigint)
language sql stable security definer set search_path='' as $$
  select l.id,l.slug,l.name,l.category,case when cardinality(l.categories)>0 then l.categories else array[l.category] end,l.region,l.location,l.service_area,l.description,l.services,l.website,l.instagram_url,l.youtube_url,l.contact_email,l.phone,l.logo_path,l.owner_verified_at is not null,l.updated_at,count(r.member_id)
  from public.directory_listings l left join public.directory_recommendations r on r.listing_id=l.id where l.status='approved'
  group by l.id order by l.name
$$;

create or replace function public.get_my_directory_listings() returns setof public.directory_listings language sql stable security definer set search_path='' as $$
  select * from public.directory_listings where owner_id=auth.uid() or submitted_by=auth.uid() order by updated_at desc
$$;

create or replace function public.update_owned_directory_listing(listing_id uuid, listing_description text, listing_region text, listing_website text, listing_services text[]) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  update public.directory_listings set description=trim(listing_description),region=trim(listing_region),website=nullif(trim(listing_website),''),services=coalesce(listing_services,'{}'),updated_at=now() where id=listing_id and owner_id=auth.uid() and status='approved';
  if not found then raise exception 'Only the verified owner can update an approved listing'; end if;
end $$;

create or replace function public.get_directory_moderation_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  select jsonb_build_object(
    'listings',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.directory_listings l where l.status='pending'),'[]'::jsonb),
    'published',coalesce((select jsonb_agg(to_jsonb(l) order by l.name) from public.directory_listings l where l.status='approved'),'[]'::jsonb),
    'claims',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('listing',to_jsonb(l)) order by c.created_at) from public.directory_claims c join public.directory_listings l on l.id=c.listing_id where c.status='pending'),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('listing',to_jsonb(l)) order by r.created_at) from public.directory_reports r join public.directory_listings l on l.id=r.listing_id where r.status='open'),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.admin_update_directory_listing(
  listing_id uuid, listing_slug text, listing_name text, listing_category text,
  listing_categories text[], listing_status text, listing_region text, listing_location text,
  listing_service_area text, listing_description text, listing_services text[], listing_website text,
  listing_instagram_url text, listing_youtube_url text, listing_contact_email text,
  listing_phone text, listing_logo_path text
) returns void language plpgsql security definer set search_path='' as $$
declare allowed_categories constant text[] := array['Freediving Schools','Clubs','Spearfishing Stores','Spearfishing Charters','YouTube Channels','Instagram Accounts','Underwater Sports'];
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if listing_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Use a lowercase, hyphenated URL slug'; end if;
  if listing_category <> all(allowed_categories) then raise exception 'Choose a valid primary category'; end if;
  if listing_categories is null or not listing_category = any(listing_categories) or not (listing_categories <@ allowed_categories) then raise exception 'Choose valid directory categories'; end if;
  if listing_status not in ('pending','approved','rejected','archived') then raise exception 'Choose a valid listing status'; end if;
  update public.directory_listings set
    slug=listing_slug,name=trim(listing_name),category=listing_category,categories=listing_categories,
    status=listing_status,region=trim(listing_region),location=nullif(trim(listing_location),''),
    service_area=nullif(trim(listing_service_area),''),description=trim(listing_description),
    services=coalesce(listing_services,'{}'),website=nullif(trim(listing_website),''),
    instagram_url=nullif(trim(listing_instagram_url),''),youtube_url=nullif(trim(listing_youtube_url),''),
    contact_email=nullif(trim(listing_contact_email),''),phone=nullif(trim(listing_phone),''),
    logo_path=nullif(trim(listing_logo_path),''),updated_at=now()
  where id=listing_id;
  if not found then raise exception 'Listing not found'; end if;
end $$;

create or replace function public.delete_directory_listing(listing_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  delete from public.directory_listings where id=listing_id;
  if not found then raise exception 'Listing not found'; end if;
end $$;

create or replace function public.moderate_directory_item(item_kind text,item_id uuid,item_decision text,moderator_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare v_listing_id uuid; v_member_id uuid;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if item_kind='listings' then
    if item_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
    update public.directory_listings set status=item_decision,moderation_note=nullif(trim(moderator_note),''),reviewed_by=auth.uid(),reviewed_at=now(),owner_id=case when item_decision='approved' then submitted_by else owner_id end,owner_verified_at=case when item_decision='approved' then now() else owner_verified_at end,updated_at=now() where id=item_id and status='pending';
  elsif item_kind='claims' then
    if item_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
    select c.listing_id,c.member_id into v_listing_id,v_member_id from public.directory_claims c where c.id=item_id and c.status='pending';
    update public.directory_claims set status=item_decision,moderation_note=nullif(trim(moderator_note),''),reviewed_by=auth.uid(),reviewed_at=now() where id=item_id and status='pending';
    if item_decision='approved' then update public.directory_listings set owner_id=v_member_id,owner_verified_at=now(),updated_at=now() where id=v_listing_id; end if;
  elsif item_kind='reports' then
    update public.directory_reports set status=case when item_decision='approved' then 'resolved' else 'dismissed' end,resolved_by=auth.uid(),resolved_at=now() where id=item_id and status='open';
  else raise exception 'Invalid item type';
  end if;
  if not found then raise exception 'Item is no longer awaiting review'; end if;
end $$;

-- BEGIN GENERATED DIRECTORY SEED
-- Generated from the reviewed directory CSV files. Unclaimed imported entries are
-- synchronised to this exact set; owner-managed listings are never removed here.
delete from public.directory_listings
where status='approved' and owner_id is null and slug not in ('adreno-melbourne','ballarat-underwater-hockey-club','club-spearfish','dive-gear-australia','drifters-freediving','freedive-geelong','geelong-freedivers','geelong-underwater-hockey-club','hoookn-adventures','maribyrnong-underwater-hockey-club','marlon-quinn-boundless-blue','melbourne-freedivers-club','monash-university-underwater-club','mr-dive','salt-sessions-freediving','simple-dive-melbourne','southern-freedivers','southern-spearfishing','torelli-spearfishing-australia','victoria-seadragons-underwater-rugby','victorian-underwater-hockey-commission','wonthaggi-underwater-hockey-club');

insert into public.directory_listings(slug,name,category,categories,region,location,service_area,description,services,website,instagram_url,youtube_url,contact_email,phone,logo_path,status,updated_at) values
('adreno-melbourne','ADRENO Melbourne','Spearfishing Stores',array['Spearfishing Stores']::text[],'Melbourne south-east','Cheltenham, VIC','Melbourne, Victoria and online Australia-wide','ADRENO Melbourne is a Victorian branch of a national dive retailer with an explicit spearfishing and freediving gear focus. The Melbourne store is relevant because it provides in-person fitting and advice for spearguns, wetsuits, fins, floats, masks and other equipment used by Victorian spearos and freedivers.',array['Spearfishing gear','freediving gear','wetsuits','fins','masks','spearguns','online and in-store retail']::text[],'https://adreno.com.au/','https://www.instagram.com/adrenospearfishing/','https://www.youtube.com/user/AdrenoSpearfishing',null,null,null,'approved','2026-09-28'),
('ballarat-underwater-hockey-club','Ballarat Underwater Hockey Club','Underwater Sports',array['Underwater Sports']::text[],'Ballarat','University of Ballarat / Federation University, Mount Helen VIC','Ballarat and western Victoria','Ballarat Underwater Hockey Club is listed by the Victorian Underwater Hockey Commission as a place to play underwater hockey in Victoria. Public club-directory sources list the club as active at the University of Ballarat / Mount Helen pool, with regular Monday night sessions and beginners welcome.',array['Underwater hockey','Monday night training','beginner participation','club play','Victorian underwater hockey pathway']::text[],'https://vuhc.org.au/find-a-game/',null,null,null,'0417 143 231',null,'approved','2026-09-28'),
('club-spearfish','Club Spearfish','Clubs',array['Clubs']::text[],'Victoria','Victoria','Victoria','Club Spearfish appears in the AUF spearfishing club listings under Victoria and is also referenced by local freediving guides. It should be treated as a provisional community directory entry until its current official website, contacts and active meeting details are manually confirmed.',array['Spearfishing club','AUF club pathway','Victorian spearfishing community']::text[],'https://aufspearfishing.com.au/clubs/',null,null,null,null,null,'approved','2026-09-28'),
('dive-gear-australia','Dive Gear Australia','Spearfishing Stores',array['Spearfishing Stores']::text[],'Melbourne south-east','Hallam, VIC','Melbourne, Victoria and online Australia-wide','Dive Gear Australia is a Hallam store that sells scuba, snorkelling, freediving and spearfishing equipment. It qualifies for this directory because its shop navigation and public contact pages explicitly include freediving and spearfishing gear, with an in-store Victorian presence for equipment advice and click-and-collect.',array['Freediving gear','spearfishing gear','masks','fins','wetsuits','floats','accessories','equipment servicing']::text[],'https://divegearaustralia.com.au/',null,null,'sales@divegearaustralia.com.au','03 9702 3694',null,'approved','2026-09-28'),
('drifters-freediving','Drifters Freediving','Freediving Schools',array['Freediving Schools']::text[],'Melbourne','Melbourne, VIC','Melbourne, Victoria and selected retreat locations','Drifters Freediving is a Melbourne-based freediving provider that advertises AIDA courses, specialty retreats and beginner spearfishing instruction. It is relevant to a Victorian community directory because it explicitly offers spearfishing education as well as freediving training, though public community commentary should be reviewed before any endorsement-style placement.',array['AIDA freediving courses','beginner spearfishing course','retreats','pool and open-water training']::text[],'https://driftersfreediving.com/','https://www.instagram.com/driftersfreediving/',null,null,null,'/assets/freediving-schools/drifters-freediving.png','approved','2026-09-28'),
('freedive-geelong','Freedive Geelong','Freediving Schools',array['Freediving Schools']::text[],'Geelong, Bellarine and Surf Coast','Geelong / Queenscliff, VIC','Geelong, Melbourne, Queenscliff, Portsea and the Surf Coast','Freedive Geelong is a Geelong-based freediving school created by James Cini, with a stated focus on Victoria, the Great Southern Reef and building safe, capable freedivers and spearfishers. Its public pages advertise PADI freediving courses and certified self-guided freedive sessions from Queenscliff or Portsea.',array['PADI Basic Freediver','PADI Freediver open-water course','PADI Advanced Freediver','certified self-guided freedive sessions','charter-style freedive sessions']::text[],'https://www.freedivegeelong.com/','https://www.instagram.com/freedivegeelong/',null,'info@freedivegeelong.com','+61 401 108 781',null,'approved','2026-09-28'),
('geelong-freedivers','Geelong Freedivers','Clubs',array['Clubs']::text[],'Geelong, Bellarine and south-west Victoria','Geelong, VIC','Geelong, Bellarine Peninsula, Surf Coast and south-west Victoria','Geelong Freedivers is an AUF-affiliated spearfishing and freediving club established in 2015. The club runs monthly catch-ups and member social dives, with a stated purpose of helping people in south-west Victoria network, train and explore underwater activities with a safety-first community approach.',array['Monthly club catch-ups','social dives','spearo clinics','competitions','freediving and spearfishing community']::text[],'https://geelongfreedivers.org/','https://www.instagram.com/geelongfreedivers/','https://www.youtube.com/@geelongfreedivers4326/featured','geelongfreedivers@gmail.com',null,'/assets/freediving-schools/geelong-freedivers.webp','approved','2026-09-28'),
('geelong-underwater-hockey-club','Geelong Underwater Hockey Club','Underwater Sports',array['Underwater Sports']::text[],'Geelong','Handbury Centre for Wellbeing, Foreshore Road, Corio VIC 3214','Geelong and Greater Geelong','Geelong Underwater Hockey Club welcomes people of varied ages and capacities to play underwater hockey in a safe, social and competitive environment. Its website lists Wednesday sessions at the Handbury Centre for Wellbeing, while the Greater Geelong community directory notes beginner gear, junior pathways and come-and-try options.',array['Underwater hockey','junior and senior games','beginner sessions','come-and-try programs','school programs','Victorian and national pathways']::text[],'https://geelongunderwaterhockey.org.au/',null,null,null,'0438 904 961',null,'approved','2026-09-28'),
('hoookn-adventures','HOOOKN Adventures','Spearfishing Charters',array['Spearfishing Charters','Instagram Accounts','YouTube Channels']::text[],'Melbourne and Port Phillip region','Melbourne, VIC','Melbourne, Victoria and beyond','HOOOKN Adventures is a Melbourne-based charter operator that explicitly advertises spearfishing tours, fishing and spearfishing experiences, and adventure retreats. It is the clearest Victorian spearfishing-specific charter found in this pass, with public contact details and social channels tied to its charter offering.',array['Spearfishing tours','fishing charters','bluewater trips','retreats','filming packages','corporate charters','spearfishing charters','Melbourne boating','travel','film packages','fishing','adventure filming']::text[],'https://hoookn.com.au/','https://www.instagram.com/hoookn.adventures/','https://www.youtube.com/@HOOOKN','benji@hoookn.com.au','0439 HOOOKN',null,'approved','2026-09-28'),
('maribyrnong-underwater-hockey-club','Maribyrnong Underwater Hockey Club','Underwater Sports',array['Underwater Sports']::text[],'Melbourne inner west','Maribyrnong Aquatic Centre, 1 Aquatic Drive, Maribyrnong VIC 3032','Maribyrnong and Melbourne inner west','Maribyrnong Underwater Hockey Club is listed by the Victorian Underwater Hockey Commission as a place to play in Victoria. The VUHC club page gives Tuesday evening sessions at the Maribyrnong Aquatic Centre, and local activity listings also show underwater hockey sessions at Maribyrnong.',array['Underwater hockey','Tuesday night training','beginner and club play','Victorian underwater hockey pathway']::text[],'https://vuhc.org.au/find-a-game/footscray-uwh-club/',null,null,'Daleschalkwijk@gmail.com','0435 824 603',null,'approved','2026-09-28'),
('marlon-quinn-boundless-blue','Marlon Quinn / Boundless Blue','Freediving Schools',array['Freediving Schools']::text[],'Mornington Peninsula','Sorrento, VIC','Mornington Peninsula and Port Phillip Bay','Marlon Quinn operates from the Mornington Peninsula under the Boundless Blue offering and is publicly described as a long-running Victorian freediving instructor. His profile is relevant for members seeking smaller-format instruction, breathwork-informed freediving training and local peninsula knowledge around Sorrento and nearby ocean sites.',array['PADI freediving instruction','instructor training','breathwork','ocean confidence training']::text[],'https://marlonquinn.com/boundless-blue/',null,null,null,null,'/assets/freediving-schools/marlon-quinn-boundless-blue.png','approved','2026-09-28'),
('melbourne-freedivers-club','Melbourne Freedivers Club','Clubs',array['Clubs']::text[],'Melbourne','Melbourne, VIC','Melbourne and Victorian freediving sites','Melbourne Freedivers Club is an Australian Freediving Association-affiliated club that encourages safe and supportive freediving. Its website and FAQ emphasise community, pool training, safety induction and member activity rather than paid instruction, so it should be listed as a club rather than a freediving school.',array['Pool training','safety induction','gear loan','depth trips','member community']::text[],'https://melbournefreedivers.org.au/','https://www.instagram.com/melbournefreediversclub/',null,'training@melbournefreedivers.org.au',null,'/assets/freediving-schools/melbourne-freedivers-club.png','approved','2026-09-28'),
('monash-university-underwater-club','Monash University Underwater Club','Underwater Sports',array['Underwater Sports']::text[],'Melbourne south-east','Clayton, VIC','Monash University and Melbourne south-east','Monash University Underwater Club includes underwater hockey membership through Team Monash. Public university club material describes underwater hockey as part of the club''s activity mix, with memberships available for students and the broader community, making it relevant for Victorian underwater-sport pathways.',array['Underwater hockey membership','university club activity','beginner and community participation']::text[],'https://clubsandvarsity.monash.edu/Clubs/Underwater-Club',null,null,null,null,null,'approved','2026-09-28'),
('mr-dive','Mr Dive','Spearfishing Stores',array['Spearfishing Stores']::text[],'Melbourne south-east','Oakleigh South, VIC','Melbourne and online Australia-wide','Mr Dive is a Melbourne dive shop in Oakleigh South that explicitly describes itself as a specialised spearfishing shop for spearos, scuba divers, snorkellers and freedivers. It is relevant because its public pages advertise spearguns, wetsuits, fins, floats, masks, snorkels and other spearfishing equipment.',array['Spearfishing gear','freediving gear','spearguns','wetsuits','fins','masks','snorkels','online retail']::text[],'https://www.mrdive.com.au/',null,null,'henryw@mrdive.com.au','03 8488 9992',null,'approved','2026-09-28'),
('salt-sessions-freediving','Salt Sessions Freediving','Freediving Schools',array['Freediving Schools']::text[],'Melbourne and Mornington Peninsula','Melbourne, VIC','Melbourne, Port Phillip Bay and Mornington Peninsula','Salt Sessions Freediving is a Melbourne-based freediving school focused on recognised beginner and continuing freediving education. Public sources describe it as a large Victorian training centre with regular local courses, experienced instructors and a pathway for people who want to develop comfort, safety and skills in Victorian waters.',array['PADI and Molchanovs freediving courses','beginner freediving','advanced training','gear hire','retreats','local club dives']::text[],'https://saltsessions.com.au/','https://www.instagram.com/salt_sessions_freediving/',null,null,'0431 699 264','/assets/freediving-schools/salt-sessions-freediving.png','approved','2026-09-28'),
('simple-dive-melbourne','Simple Dive Melbourne','Freediving Schools',array['Freediving Schools']::text[],'Melbourne east','Blackburn South, VIC','Melbourne and eastern suburbs','Simple Dive Melbourne is a Blackburn South dive business that publicly advertises AIDA freediving alongside scuba and equipment services. It is suitable for the directory because it has a physical Victorian shopfront and a clear freediving training offer rather than being a general scuba-only operator.',array['AIDA freediving','scuba courses','dive gear retail','equipment support']::text[],'https://www.simpledive.com.au/','https://www.instagram.com/simpledivemel/',null,'info@simpledive.com.au','+61 414 907 659','/assets/freediving-schools/simple-dive-melbourne.png','approved','2026-09-28'),
('southern-freedivers','Southern Freedivers','Clubs',array['Clubs']::text[],'Melbourne and Victoria-wide','Melbourne, VIC','Victoria','Southern Freedivers is a volunteer-run Victorian spearfishing club established in 1994. Its website describes competition spearfishing, social dives, member catch-ups and quarterly meetings, making it a strong community directory entry for people seeking spearfishing networks, local knowledge and structured club involvement in Victoria.',array['Competition spearfishing','social dives','member catch-ups','quarterly meetings','spearfishing community']::text[],'https://southernfreedivers.org.au/',null,null,null,null,'/assets/freediving-schools/southern-freedivers.svg','approved','2026-09-28'),
('southern-spearfishing','Southern Spearfishing','Instagram Accounts',array['Instagram Accounts']::text[],'Melbourne and Victoria','Melbourne and Victoria',null,'This Instagram account appears connected to the same Victorian spearfishing creator presence as Southern Spearfishing on YouTube. It is suitable as a local creator listing if posts are confirmed to feature Victorian spearfishing, local species, dive trips or education rather than unrelated travel-only content.',array['spearfishing','local catches','Melbourne diving','gear','community']::text[],null,'https://www.instagram.com/southernspearfishing/',null,null,null,null,'approved','2026-09-28'),
('torelli-spearfishing-australia','Torelli Spearfishing Australia','Spearfishing Stores',array['Spearfishing Stores']::text[],'Mornington Peninsula','Capel Sound, VIC','Victoria and online Australia-wide','Torelli Spearfishing Australia is a Victorian spearfishing equipment brand and factory store based in Capel Sound. Its official pages state that it was founded in Australia in 1996 and supplies wetsuits, spearguns, fins, masks, floats and accessories for recreational and competition spearfishers.',array['Spearfishing wetsuits','spearguns','freediving fins','masks','snorkels','float systems','accessories','factory store']::text[],'https://torelli.com.au/',null,null,null,'(03) 5987 0693',null,'approved','2026-09-28'),
('victoria-seadragons-underwater-rugby','Victoria Seadragons Underwater Rugby','Underwater Sports',array['Underwater Sports','Instagram Accounts']::text[],'Melbourne east','Glen Iris / Box Hill, VIC','Melbourne and Australian underwater rugby competitions','Victoria Seadragons is the Victorian underwater rugby club listed by Underwater Rugby Australia and Aqualink. Public pages state that beginners are welcome, equipment can be provided, and the team competes around Australia, making it the key Victorian underwater rugby entry for the directory.',array['Underwater rugby training','beginner sessions','social games','competition','equipment for trials','underwater rugby','breath-hold sport','training','competitions']::text[],'https://www.uwra.org.au/play','https://www.instagram.com/victoriaseadragonsuwr/',null,'victoriaseadragonsuwr@gmail.com',null,null,'approved','2026-09-28'),
('victorian-underwater-hockey-commission','Victorian Underwater Hockey Commission','Underwater Sports',array['Underwater Sports','Instagram Accounts']::text[],'Victoria','Victoria','Victoria','The Victorian Underwater Hockey Commission is the peak body for underwater hockey in Victoria. Its site publishes state team, competition and contact information, and lists public committee contact emails and social channels, making it the primary directory entry for members interested in Victorian underwater hockey.',array['Underwater hockey governance','competitions','state teams','club coordination','enquiries','underwater hockey','Victorian competitions','junior sport','club updates']::text[],'https://vuhc.org.au/','https://www.instagram.com/victorian_uwh_vuhc/',null,'committee@vuhc.org.au',null,null,'approved','2026-09-28'),
('wonthaggi-underwater-hockey-club','Wonthaggi Underwater Hockey Club','Underwater Sports',array['Underwater Sports']::text[],'Bass Coast','Wonthaggi, VIC','Wonthaggi, Bass Coast and Victorian competitions','Wonthaggi Underwater Hockey Club is a Bass Coast club playing at the Bass Coast Aquatic and Leisure Centre. VUHC lists junior and senior Thursday sessions, and local reporting describes Wonthaggi as one of Victoria''s major underwater hockey teams with strong junior development.',array['Underwater hockey juniors','senior training','tournaments','beginner participation']::text[],'https://vuhc.org.au/find-a-game/wonthaggi-uwh-club/',null,null,'wonthaggiunderwaterhockey@hotmail.com',null,null,'approved','2026-09-28')
on conflict(slug) do update set
  name=excluded.name,category=excluded.category,categories=excluded.categories,region=excluded.region,location=excluded.location,
  service_area=excluded.service_area,description=excluded.description,services=excluded.services,
  website=excluded.website,instagram_url=excluded.instagram_url,youtube_url=excluded.youtube_url,
  contact_email=excluded.contact_email,phone=excluded.phone,logo_path=excluded.logo_path,updated_at=excluded.updated_at
where public.directory_listings.owner_id is null;
-- END GENERATED DIRECTORY SEED
revoke all on function public.submit_directory_listing(text,text,text,text,text,text,text,text[],text,text,text,text,text) from public;
revoke all on function public.claim_directory_listing(text,text) from public;
revoke all on function public.recommend_directory_listing(text,text) from public;
revoke all on function public.report_directory_listing(text,text) from public;
grant execute on function public.submit_directory_listing(text,text,text,text,text,text,text,text[],text,text,text,text,text) to authenticated;
grant execute on function public.claim_directory_listing(text,text) to authenticated;
grant execute on function public.recommend_directory_listing(text,text) to authenticated;
grant execute on function public.report_directory_listing(text,text) to authenticated;
grant execute on function public.get_public_directory() to anon, authenticated;
grant execute on function public.get_my_directory_listings() to authenticated;
grant execute on function public.update_owned_directory_listing(uuid,text,text,text,text[]) to authenticated;
grant execute on function public.get_directory_moderation_queue() to authenticated;
grant execute on function public.admin_update_directory_listing(uuid,text,text,text,text[],text,text,text,text,text,text[],text,text,text,text,text,text) to authenticated;
grant execute on function public.moderate_directory_item(text,uuid,text,text) to authenticated;
grant execute on function public.delete_directory_listing(uuid) to authenticated;

grant select on public.directory_listings to anon, authenticated;
grant update on public.directory_listings to authenticated;
grant select on public.directory_claims,public.directory_recommendations,public.directory_reports to authenticated;




