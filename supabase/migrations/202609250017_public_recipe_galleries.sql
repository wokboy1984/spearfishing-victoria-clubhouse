-- Publish complete recipe galleries and expose them on public species pages.

alter table public.recipes
  add column if not exists public_photo_paths text[] not null default '{}'::text[];

create or replace function public.moderate_recipe_submission(
  target_submission_id uuid,
  target_decision text,
  target_note text default null,
  target_public_photo_path text default null,
  target_public_photo_paths text[] default null
)
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

 update public.submissions
 set status=target_decision::public.content_status,
     moderation_note=nullif(trim(target_note),''),
     reviewed_by=auth.uid(),
     reviewed_at=now(),
     public_photo_path=case when target_decision='approved' then trim(target_public_photo_path) else null end
 where id=target_submission_id;

 update public.recipes
 set public_photo_paths=case
   when target_decision='approved' then coalesce(target_public_photo_paths, array[trim(target_public_photo_path)])
   else '{}'::text[]
 end
 where submission_id=target_submission_id;

 if target_decision='approved' then
   select id into target_challenge_id from public.challenges where species_id=target_submission.species_id and status='active' order by starts_on desc limit 1;
   if target_challenge_id is not null and not exists(select 1 from public.point_events where submission_id=target_submission_id and reason='Published community recipe') then
     insert into public.point_events(user_id,challenge_id,submission_id,reason,points,awarded_by) values(target_submission.user_id,target_challenge_id,target_submission_id,'Published community recipe',10,auth.uid());
   end if;
 end if;
end; $$;

revoke all on function public.moderate_recipe_submission(uuid,text,text,text,text[]) from public;
grant execute on function public.moderate_recipe_submission(uuid,text,text,text,text[]) to authenticated;

drop function if exists public.get_species_recipes(text, integer);

create function public.get_species_recipes(
  target_species_slug text,
  result_limit integer default 24
)
returns table (
  submission_id uuid,
  username text,
  display_name text,
  instagram_handle text,
  title text,
  story text,
  prep_minutes integer,
  cook_minutes integer,
  serves integer,
  ingredients text[],
  method text[],
  public_photo_path text,
  public_photo_paths text[],
  published_on date
)
language sql stable security definer set search_path = '' as $$
  select
    submission.id,
    profile.username,
    profile.display_name,
    case when profile.show_instagram_on_catches then profile.instagram_handle else null end,
    submission.title,
    submission.story,
    recipe.prep_minutes,
    recipe.cook_minutes,
    recipe.serves,
    recipe.ingredients,
    recipe.method,
    submission.public_photo_path,
    case
      when coalesce(array_length(recipe.public_photo_paths, 1), 0) > 0 then recipe.public_photo_paths
      when submission.public_photo_path is not null then array[submission.public_photo_path]
      else '{}'::text[]
    end,
    coalesce(submission.reviewed_at, submission.created_at)::date
  from public.submissions submission
  join public.recipes recipe on recipe.submission_id = submission.id
  join public.species species on species.id = submission.species_id and species.slug = target_species_slug and species.is_active = true
  join public.profiles profile on profile.id = submission.user_id
  where submission.kind = 'recipe' and submission.status = 'approved'
  order by coalesce(submission.reviewed_at, submission.created_at) desc
  limit greatest(1, least(coalesce(result_limit, 24), 50));
$$;

revoke all on function public.get_species_recipes(text, integer) from public;
grant execute on function public.get_species_recipes(text, integer) to anon, authenticated;
