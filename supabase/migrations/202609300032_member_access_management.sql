-- Administrator-controlled member access. Moderators review community content;
-- only administrators can manage accounts, directory ownership and staff roles.

alter table public.profiles
  add column if not exists account_limited boolean not null default false,
  add column if not exists account_limit_reason text,
  add column if not exists account_limited_at timestamptz,
  add column if not exists account_limited_by uuid references public.profiles(id) on delete set null;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_submission_id uuid references public.submissions(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

drop policy if exists "Administrators read the audit log" on public.admin_audit_log;
create policy "Administrators read the audit log" on public.admin_audit_log
for select using (public.is_admin());

create or replace function public.get_admin_members()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'username',p.username,'display_name',p.display_name,'role',p.role,
      'email',u.email,'created_at',p.created_at,'last_sign_in_at',u.last_sign_in_at,
      'account_limited',p.account_limited,'account_limit_reason',p.account_limit_reason,
      'submission_count',(select count(*) from public.submissions s where s.user_id=p.id),
      'pending_count',(select count(*) from public.submissions s where s.user_id=p.id and s.status='pending')
    ) order by p.created_at desc)
    from public.profiles p join auth.users u on u.id=p.id
  ),'[]'::jsonb);
end;
$$;

create or replace function public.admin_set_member_role(target_user_id uuid,target_role text)
returns void language plpgsql security definer set search_path='' as $$
declare previous_role text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if target_user_id=auth.uid() then raise exception 'You cannot change your own access level'; end if;
  if target_role not in ('member','moderator','admin') then raise exception 'Invalid access level'; end if;
  select role::text into previous_role from public.profiles where id=target_user_id for update;
  if previous_role is null then raise exception 'Member not found'; end if;
  update public.profiles set role=target_role::public.member_role where id=target_user_id;
  insert into public.admin_audit_log(actor_id,action,target_user_id,metadata)
  values(auth.uid(),'member_role_changed',target_user_id,jsonb_build_object('from',previous_role,'to',target_role));
end;
$$;

create or replace function public.admin_set_account_limit(target_user_id uuid,limited boolean,reason text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if target_user_id=auth.uid() then raise exception 'You cannot limit your own account'; end if;
  if limited and char_length(trim(coalesce(reason,'')))<5 then raise exception 'Add a brief reason for limiting this account'; end if;
  update public.profiles set account_limited=limited,
    account_limit_reason=case when limited then trim(reason) else null end,
    account_limited_at=case when limited then now() else null end,
    account_limited_by=case when limited then auth.uid() else null end
  where id=target_user_id;
  if not found then raise exception 'Member not found'; end if;
  insert into public.admin_audit_log(actor_id,action,target_user_id,reason)
  values(auth.uid(),case when limited then 'account_limited' else 'account_restored' end,target_user_id,nullif(trim(reason),''));
end;
$$;

create or replace function public.admin_delete_submission(target_submission_id uuid,delete_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare target_member uuid; target_kind text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if char_length(trim(coalesce(delete_reason,'')))<5 then raise exception 'Add a brief deletion reason'; end if;
  select user_id,kind::text into target_member,target_kind from public.submissions where id=target_submission_id for update;
  if target_member is null then raise exception 'Entry not found'; end if;
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_submission_id,reason,metadata)
  values(auth.uid(),'submission_deleted',target_member,target_submission_id,trim(delete_reason),jsonb_build_object('kind',target_kind));
  delete from public.submissions where id=target_submission_id;
end;
$$;

create or replace function public.admin_delete_member(target_user_id uuid,delete_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if target_user_id=auth.uid() then raise exception 'You cannot delete your own account'; end if;
  if char_length(trim(coalesce(delete_reason,'')))<5 then raise exception 'Add a brief deletion reason'; end if;
  select jsonb_build_object('username',p.username,'display_name',p.display_name,'role',p.role,'email',u.email)
    into snapshot from public.profiles p join auth.users u on u.id=p.id where p.id=target_user_id;
  if snapshot is null then raise exception 'Member not found'; end if;
  insert into public.admin_audit_log(actor_id,action,reason,metadata)
  values(auth.uid(),'member_deleted',trim(delete_reason),snapshot);
  delete from auth.users where id=target_user_id;
end;
$$;

-- Directory ownership and destructive directory actions are administrator-only.
create or replace function public.moderate_directory_claim(
  claim_id uuid,
  claim_decision text,
  moderator_note text default null,
  contact_checked boolean default false,
  authority_confirmed boolean default false,
  scope_checked boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare v_listing_id uuid; v_member_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if claim_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  if claim_decision='approved' and not (contact_checked and authority_confirmed and scope_checked) then raise exception 'Complete all ownership checks before approval'; end if;
  if claim_decision='rejected' and char_length(trim(coalesce(moderator_note,'')))<5 then raise exception 'A rejection reason is required'; end if;
  select c.listing_id,c.member_id into v_listing_id,v_member_id from public.directory_claims c where c.id=claim_id and c.status='pending' for update;
  if v_listing_id is null then raise exception 'Pending claim not found'; end if;
  if claim_decision='approved' and exists(select 1 from public.directory_listings where id=v_listing_id and owner_id is not null and owner_id<>v_member_id) then raise exception 'This listing already has a verified owner'; end if;
  update public.directory_claims set status=claim_decision,moderation_note=nullif(trim(moderator_note),''),reviewed_by=auth.uid(),reviewed_at=now() where id=claim_id;
  if claim_decision='approved' then
    update public.directory_claims set status='rejected',moderation_note='Another verified claim was approved.',reviewed_by=auth.uid(),reviewed_at=now() where listing_id=v_listing_id and status='pending' and id<>claim_id;
    update public.directory_listings set owner_id=v_member_id,owner_verified_at=now(),updated_at=now() where id=v_listing_id and owner_id is null;
  end if;
end;
$$;

create or replace function public.reject_limited_account_submission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.profiles where id=new.user_id and account_limited) then
    raise exception 'This account is currently limited. Contact an administrator for help.';
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_reject_limited_account on public.submissions;
create trigger submissions_reject_limited_account before insert on public.submissions
for each row execute function public.reject_limited_account_submission();

create or replace function public.reject_limited_directory_action()
returns trigger language plpgsql security definer set search_path='' as $$
declare member_id uuid;
begin
  member_id := coalesce((to_jsonb(new)->>'submitted_by')::uuid,(to_jsonb(new)->>'member_id')::uuid);
  if exists(select 1 from public.profiles where id=member_id and account_limited) then
    raise exception 'This account is currently limited. Contact an administrator for help.';
  end if;
  return new;
end;
$$;

drop trigger if exists directory_listings_reject_limited_account on public.directory_listings;
create trigger directory_listings_reject_limited_account before insert on public.directory_listings
for each row execute function public.reject_limited_directory_action();
drop trigger if exists directory_claims_reject_limited_account on public.directory_claims;
create trigger directory_claims_reject_limited_account before insert on public.directory_claims
for each row execute function public.reject_limited_directory_action();
drop trigger if exists directory_recommendations_reject_limited_account on public.directory_recommendations;
create trigger directory_recommendations_reject_limited_account before insert on public.directory_recommendations
for each row execute function public.reject_limited_directory_action();
drop trigger if exists directory_reports_reject_limited_account on public.directory_reports;
create trigger directory_reports_reject_limited_account before insert on public.directory_reports
for each row execute function public.reject_limited_directory_action();

revoke all on function public.get_admin_members() from public;
revoke all on function public.admin_set_member_role(uuid,text) from public;
revoke all on function public.admin_set_account_limit(uuid,boolean,text) from public;
revoke all on function public.admin_delete_submission(uuid,text) from public;
revoke all on function public.admin_delete_member(uuid,text) from public;
grant execute on function public.get_admin_members() to authenticated;
grant execute on function public.admin_set_member_role(uuid,text) to authenticated;
grant execute on function public.admin_set_account_limit(uuid,boolean,text) to authenticated;
grant execute on function public.admin_delete_submission(uuid,text) to authenticated;
grant execute on function public.admin_delete_member(uuid,text) to authenticated;
