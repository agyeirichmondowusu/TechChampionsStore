-- TechChampionStore schema. Run in the Supabase SQL editor (or `supabase db push`), then run seed.sql.

create extension if not exists pgcrypto;

-- Admins: add a row here (with the auth user's id) to give that account access to /admin.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null check (category in ('microcontrollers','sensors','actuators','power','3d-printers')),
  type text,
  price numeric(10,2) not null default 0,
  old_price numeric(10,2),
  stock integer not null default 0,
  short_description text,
  description text,
  specs jsonb not null default '{}'::jsonb,
  image_url text,
  gallery text[] not null default '{}',
  video_url text,
  rating numeric(2,1) default 4.8,
  sold integer not null default 0,
  is_active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

-- Site settings: one row (id = 1) holding grid size, contacts, socials, payment details, delivery options...
create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- Orders sent through WhatsApp checkout (logged so the admin can follow up).
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_note text,
  delivery_option text,
  delivery_fee numeric(10,2) not null default 0,
  items jsonb not null,
  subtotal numeric(10,2) not null,
  total numeric(10,2) not null,
  status text not null default 'new' check (status in ('new','paid','dispatched','completed','cancelled')),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Row level security
alter table public.admins enable row level security;
alter table public.products enable row level security;
alter table public.site_settings enable row level security;
alter table public.orders enable row level security;

drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products for select using (is_active or public.is_admin());
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings for select using (true);
drop policy if exists "settings admin write" on public.site_settings;
create policy "settings admin write" on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders anyone create" on public.orders;
create policy "orders anyone create" on public.orders for insert with check (true);
drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read" on public.orders for select using (public.is_admin() or user_id = auth.uid());
drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders for update using (public.is_admin());
drop policy if exists "orders admin delete" on public.orders;
create policy "orders admin delete" on public.orders for delete using (public.is_admin());

-- Storage bucket for product images. Uploads go to <category>/<file>, i.e.
-- microcontrollers/, sensors/, actuators/, power/, 3d-printers/ (plus site/ for hero and avatar images).
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read" on storage.objects for select using (bucket_id = 'product-images');
drop policy if exists "product images admin insert" on storage.objects;
create policy "product images admin insert" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "product images admin update" on storage.objects;
create policy "product images admin update" on storage.objects for update using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete" on storage.objects for delete using (bucket_id = 'product-images' and public.is_admin());
