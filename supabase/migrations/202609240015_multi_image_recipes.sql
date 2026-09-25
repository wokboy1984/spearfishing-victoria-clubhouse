-- Allow a recipe hero plus up to four ordered supporting images.

alter table public.submission_photos
  drop constraint if exists submission_photos_submission_id_kind_key,
  drop constraint if exists submission_photos_display_order_check;

alter table public.submission_photos
  add constraint submission_photos_display_order_check check (display_order between 1 and 5);

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
  target_rules_accepted boolean,
  target_extra_photo_paths text[] default array[]::text[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare member_id uuid := auth.uid(); extra_path text; photo_order integer := 2;
begin
  if member_id is null then raise exception 'Sign in to submit a recipe'; end if;
  if not target_rules_accepted then raise exception 'Recipe sharing terms must be accepted'; end if;
  if char_length(trim(target_title)) < 3 or char_length(trim(target_story)) < 10 then raise exception 'Add a title and short introduction'; end if;
  if coalesce(array_length(target_ingredients, 1), 0) < 2 or coalesce(array_length(target_method, 1), 0) < 2 then raise exception 'Add at least two ingredients and two method steps'; end if;
  if target_photo_path is null or trim(target_photo_path) = '' then raise exception 'A finished dish photo is required'; end if;
  if coalesce(array_length(target_extra_photo_paths, 1), 0) > 4 then raise exception 'A recipe can have up to four optional photos'; end if;

  insert into public.submissions (id,user_id,species_id,kind,title,story,broad_region,status,rules_accepted_at)
  values (target_submission_id,member_id,target_species_id,'recipe',trim(target_title),trim(target_story),'Other Victoria','pending',now());
  insert into public.recipes (submission_id,prep_minutes,cook_minutes,serves,ingredients,method)
  values (target_submission_id,target_prep_minutes,target_cook_minutes,target_serves,target_ingredients,target_method);
  insert into public.submission_photos (submission_id,kind,storage_path,display_order)
  values (target_submission_id,'hero',trim(target_photo_path),1);
  foreach extra_path in array coalesce(target_extra_photo_paths,array[]::text[]) loop
    insert into public.submission_photos (submission_id,kind,storage_path,display_order)
    values (target_submission_id,'extra',trim(extra_path),photo_order);
    photo_order := photo_order + 1;
  end loop;
  return target_submission_id;
end; $$;

revoke all on function public.create_recipe_submission(uuid,uuid,text,text,integer,integer,integer,text[],text[],text,boolean,text[]) from public;
grant execute on function public.create_recipe_submission(uuid,uuid,text,text,integer,integer,integer,text[],text[],text,boolean,text[]) to authenticated;
