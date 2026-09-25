-- Member-controlled cleanup after a moderation rejection.

create or replace function public.delete_my_rejected_submission(target_submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  delete from public.submissions
  where id = target_submission_id and user_id = auth.uid() and status = 'rejected';
  if not found then raise exception 'Rejected submission not found'; end if;
end; $$;

revoke all on function public.delete_my_rejected_submission(uuid) from public;
grant execute on function public.delete_my_rejected_submission(uuid) to authenticated;
