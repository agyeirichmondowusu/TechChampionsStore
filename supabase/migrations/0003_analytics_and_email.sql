-- Visitor analytics, order emails and newsletter subscribers.
-- Run after 0001 and 0002. Visits are written only by the track-visit edge function (service role);
-- IP addresses are used for the location lookup and never stored.

-- ---------- Analytics ----------
-- One row per browser (a random id kept in the visitor's localStorage after they accept the notice).
create table if not exists public.visitors (
  id uuid primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  sessions integer not null default 1,
  pageviews integer not null default 0,
  country text,
  country_code text,
  region text,
  city text,
  device text,
  browser text,
  os text
);
create index if not exists visitors_last_seen_idx on public.visitors(last_seen);

-- One row per page view. A session is a run of page views with less than 30 minutes between them.
create table if not exists public.visits (
  id bigint generated always as identity primary key,
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  session_id uuid not null,
  path text not null,
  referrer text,
  country text,
  country_code text,
  region text,
  city text,
  timezone text,
  device text,
  browser text,
  os text,
  language text,
  created_at timestamptz not null default now()
);
create index if not exists visits_created_idx on public.visits(created_at);
create index if not exists visits_session_idx on public.visits(session_id);
create index if not exists visits_visitor_idx on public.visits(visitor_id);

alter table public.visitors enable row level security;
alter table public.visits enable row level security;

drop policy if exists "visitors admin read" on public.visitors;
create policy "visitors admin read" on public.visitors for select using (public.is_admin());
drop policy if exists "visitors admin delete" on public.visitors;
create policy "visitors admin delete" on public.visitors for delete using (public.is_admin());
drop policy if exists "visits admin read" on public.visits;
create policy "visits admin read" on public.visits for select using (public.is_admin());
drop policy if exists "visits admin delete" on public.visits;
create policy "visits admin delete" on public.visits for delete using (public.is_admin());

-- Records one page view and keeps the visitor's totals in step. Called by the track-visit function only.
create or replace function public.record_visit(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  vid uuid := (p->>'visitor_id')::uuid;
  sid uuid := (p->>'session_id')::uuid;
  new_session boolean;
begin
  new_session := not exists (select 1 from public.visits where session_id = sid);
  insert into public.visitors as v (id, pageviews, sessions, country, country_code, region, city, device, browser, os)
  values (vid, 1, 1, p->>'country', p->>'country_code', p->>'region', p->>'city', p->>'device', p->>'browser', p->>'os')
  on conflict (id) do update set
    last_seen = now(),
    pageviews = v.pageviews + 1,
    sessions = v.sessions + case when new_session then 1 else 0 end,
    country = coalesce(excluded.country, v.country),
    country_code = coalesce(excluded.country_code, v.country_code),
    region = coalesce(excluded.region, v.region),
    city = coalesce(excluded.city, v.city),
    device = coalesce(excluded.device, v.device),
    browser = coalesce(excluded.browser, v.browser),
    os = coalesce(excluded.os, v.os);
  insert into public.visits (visitor_id, session_id, path, referrer, country, country_code, region, city, timezone, device, browser, os, language)
  values (vid, sid, left(p->>'path', 300), left(p->>'referrer', 300), p->>'country', p->>'country_code', p->>'region', p->>'city',
          p->>'timezone', p->>'device', p->>'browser', p->>'os', left(p->>'language', 20));
end; $$;
revoke execute on function public.record_visit(jsonb) from public, anon, authenticated;

-- Optional clean-up: delete page views older than 13 months. Run by hand or schedule it with pg_cron.
create or replace function public.purge_old_visits() returns void
language sql security definer set search_path = public as $$
  delete from public.visits where created_at < now() - interval '13 months';
  delete from public.visitors where last_seen < now() - interval '13 months';
$$;
revoke execute on function public.purge_old_visits() from public, anon, authenticated;

-- ---------- Order emails ----------
alter table public.orders add column if not exists customer_email text;
-- Set when the order confirmation and owner alert have gone out, so a retry never sends twice.
alter table public.orders add column if not exists notified_at timestamptz;

-- ---------- Newsletter / product updates ----------
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  source text,
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
alter table public.subscribers enable row level security;
drop policy if exists "subscribers admin read" on public.subscribers;
create policy "subscribers admin read" on public.subscribers for select using (public.is_admin());
drop policy if exists "subscribers admin delete" on public.subscribers;
create policy "subscribers admin delete" on public.subscribers for delete using (public.is_admin());

-- Anyone can subscribe (or re-subscribe) without seeing the list.
create or replace function public.subscribe(p_email text, p_name text default null, p_source text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then
    raise exception 'Please enter a valid email address';
  end if;
  insert into public.subscribers (email, name, source) values (lower(trim(p_email)), nullif(trim(p_name), ''), p_source)
  on conflict (email) do update set unsubscribed_at = null, name = coalesce(excluded.name, public.subscribers.name);
end; $$;
grant execute on function public.subscribe(text, text, text) to anon, authenticated;

-- The link in every update email carries the subscriber's token.
create or replace function public.unsubscribe(p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.subscribers set unsubscribed_at = now() where token = p_token and unsubscribed_at is null;
  return exists (select 1 from public.subscribers where token = p_token);
end; $$;
grant execute on function public.unsubscribe(uuid) to anon, authenticated;
