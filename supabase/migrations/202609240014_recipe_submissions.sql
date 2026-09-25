-- Community recipe submissions, moderation, publication and points.

create or replace function public.create_recipe_submission(
  target_submission_id uuid,
  target_species_id uuid,
  target_title text,
  target_story text,
  target_prep_minutes integer,
  target_cook_minutes integer,
  target_serves integer,
  target_ingredients text[],
  target_method text[],
  target_photo_path text,
  target_rules_accepted boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare member_id uuid := auth.uid();
begin
  if member_id is null then raise exception 'Sign in to submit a recipe'; end if;
  if not target_rules_accepted then raise exception 'Recipe sharing terms must be accepted'; end if;
  if char_length(trim(target_title)) < 3 or char_length(trim(target_story)) < 10 then raise exception 'Add a title and short introduction'; end if;
  if coalesce(array_length(target_ingredients, 1), 0) < 2 or coalesce(array_length(target_method, 1), 0) < 2 then raise exception 'Add at least two ingredients and two method steps'; end if;
  if target_photo_path is null or trim(target_photo_path) = '' then raise exception 'A finished dish photo is required'; end if;

  insert into public.submissions (id,user_id,species_id,kind,title,story,broad_region,status,rules_accepted_at)
  values (target_submission_id,member_id,target_species_id,'recipe',trim(target_title),trim(target_story),'Other Victoria','pending',now());
  insert into public.recipes (submission_id,prep_minutes,cook_minutes,serves,ingredients,method)
  values (target_submission_id,target_prep_minutes,target_cook_minutes,target_serves,target_ingredients,target_method);
  insert into public.submission_photos (submission_id,kind,storage_path,display_order)
  values (target_submission_id,'hero',trim(target_photo_path),1);
  return target_submission_id;
end; $$;

create or replace function public.get_recipe_moderation_submissions(target_status text default null)
returns table (submission_id uuid,member_id uuid,username text,display_name text,instagram_handle text,species_id uuid,species_slug text,species_name text,submission_kind text,title text,story text,submission_status text,moderation_note text,public_photo_path text,submitted_at timestamptz,reviewed_at timestamptz,photos jsonb,recipe jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff access is required'; end if;
 return query select s.id,s.user_id,p.username,p.display_name,p.instagram_handle,sp.id,sp.slug,sp.common_name,s.kind::text,s.title,s.story,s.status::text,s.moderation_note,s.public_photo_path,s.created_at,s.reviewed_at,
 coalesce((select jsonb_agg(jsonb_build_object('id',ph.id,'kind',ph.kind::text,'storage_path',ph.storage_path,'display_order',ph.display_order)) from public.submission_photos ph where ph.submission_id=s.id),'[]'::jsonb),
 jsonb_build_object('prep_minutes',r.prep_minutes,'cook_minutes',r.cook_minutes,'serves',r.serves,'ingredients',r.ingredients,'method',r.method)
 from public.submissions s join public.profiles p on p.id=s.user_id join public.species sp on sp.id=s.species_id join public.recipes r on r.submission_id=s.id
 where s.kind='recipe' and (target_status is null or s.status::text=target_status)
 order by case s.status when 'pending' then 0 when 'approved' then 1 else 2 end,coalesce(s.reviewed_at,s.created_at) desc limit 200;
end; $$;

create or replace function public.moderate_recipe_submission(target_submission_id uuid,target_decision text,target_note text default null,target_public_photo_path text default null)
returns void language plpgsql security definer set search_path = public as $$
declare target_submission public.submissions%rowtype; target_challenge_id uuid;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff access is required'; end if;
 if target_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
 select * into target_submission from public.submissions where id=target_submission_id and kind='recipe' for update;
 if not found then raise exception 'Recipe submission not found'; end if;
 if target_submission.status<>'pending' then raise exception 'Only pending recipes can be moderated'; end if;
 if target_decision='approved' and (target_public_photo_path is null or trim(target_public_photo_path)='') then raise exception 'A published recipe image is required'; end if;
 if target_decision='rejected' and (target_note is null or char_length(trim(target_note))<5) then raise exception 'Add a short reason before rejecting this recipe'; end if;
 update public.submissions set status=target_decision::public.content_status,moderation_note=nullif(trim(target_note),''),reviewed_by=auth.uid(),reviewed_at=now(),public_photo_path=case when target_decision='approved' then trim(target_public_photo_path) else null end where id=target_submission_id;
 if target_decision='approved' then
   select id into target_challenge_id from public.challenges where species_id=target_submission.species_id and status='active' order by starts_on desc limit 1;
   if target_challenge_id is not null and not exists(select 1 from public.point_events where submission_id=target_submission_id and reason='Published community recipe') then
     insert into public.point_events(user_id,challenge_id,submission_id,reason,points,awarded_by) values(target_submission.user_id,target_challenge_id,target_submission_id,'Published community recipe',10,auth.uid());
   end if;
 end if;
end; $$;

revoke all on function public.create_recipe_submission(uuid,uuid,text,text,integer,integer,integer,text[],text[],text,boolean) from public;
revoke all on function public.get_recipe_moderation_submissions(text) from public;
revoke all on function public.moderate_recipe_submission(uuid,text,text,text) from public;
grant execute on function public.create_recipe_submission(uuid,uuid,text,text,integer,integer,integer,text[],text[],text,boolean) to authenticated;
grant execute on function public.get_recipe_moderation_submissions(text) to authenticated;
grant execute on function public.moderate_recipe_submission(uuid,text,text,text) to authenticated;

create or replace function public.get_my_submissions()
returns table (submission_id uuid,species_slug text,species_name text,submission_title text,story text,length_cm numeric,submission_status text,moderation_note text,public_photo_path text,hero_photo_path text,submitted_at timestamptz,reviewed_at timestamptz,notification_unread boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 return query select s.id,sp.slug,sp.common_name,s.title,s.story,s.length_cm,s.status::text,s.moderation_note,s.public_photo_path,(select ph.storage_path from public.submission_photos ph where ph.submission_id=s.id and ph.kind='hero' limit 1),s.created_at,s.reviewed_at,s.reviewed_at is not null and (s.member_seen_at is null or s.member_seen_at<s.reviewed_at)
 from public.submissions s left join public.species sp on sp.id=s.species_id where s.user_id=auth.uid() and s.kind in ('catch','recipe') order by s.created_at desc limit 100;
end; $$;

create or replace function public.mark_my_submission_notifications_seen()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 update public.submissions set member_seen_at=now() where user_id=auth.uid() and kind in ('catch','recipe') and reviewed_at is not null and (member_seen_at is null or member_seen_at<reviewed_at);
 get diagnostics affected=row_count; return affected;
end; $$;
