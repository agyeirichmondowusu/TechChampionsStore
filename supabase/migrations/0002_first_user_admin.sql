-- The first account on the site becomes the store admin automatically.

-- New sign-ups: if there is no admin yet, the new user becomes one.
create or replace function public.grant_first_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(424242);
  if not exists (select 1 from public.admins) then
    insert into public.admins (user_id, email) values (new.id, new.email);
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_first_admin on auth.users;
create trigger on_auth_user_created_first_admin
  after insert on auth.users for each row execute function public.grant_first_admin();

-- Logins: covers accounts created before this migration. Called by the site after login;
-- grants admin only while the admins table is still empty. Returns whether the caller is admin.
create or replace function public.claim_first_admin() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(424242);
  if not exists (select 1 from public.admins) then
    insert into public.admins (user_id, email) select id, email from auth.users where id = auth.uid();
  end if;
  return exists (select 1 from public.admins where user_id = auth.uid());
end; $$;

revoke execute on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;
