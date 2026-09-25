-- Members can remove any of their own submissions and associated awarded points.

create policy "Members remove their published submission images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.submissions submission
    left join public.recipes recipe on recipe.submission_id = submission.id
    where submission.user_id = auth.uid()
      and (
        submission.public_photo_path = name
        or name = any(coalesce(recipe.public_photo_paths, '{}'::text[]))
      )
  )
);

create or replace function public.delete_my_submission(target_submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  delete from public.point_events
  where submission_id = target_submission_id
    and user_id = auth.uid();

  delete from public.submissions
  where id = target_submission_id and user_id = auth.uid();

  if not found then raise exception 'Submission not found'; end if;
end; $$;

revoke all on function public.delete_my_submission(uuid) from public;
grant execute on function public.delete_my_submission(uuid) to authenticated;
