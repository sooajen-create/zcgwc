-- 拾物 Shelf Supabase schema
-- Run in Supabase SQL Editor. RLS restricts all write access to authenticated users
-- who own the row. Public visitors can read the published collection.
-- For a single-owner site, configure only your own Auth account and do not offer public sign-up.

create table if not exists public.folders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  emoji text not null default '◇',
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id text null references public.folders(id) on delete set null,
  title text not null default '',
  price numeric null,
  currency text not null default 'EUR',
  store text not null default '',
  url text not null,
  image_url text not null default '',
  rating smallint null check (rating between 1 and 5),
  status text not null default 'considering',
  review text not null default '',
  notes text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.folders enable row level security;
alter table public.products enable row level security;

-- Public read access for public folders/products.
drop policy if exists "Public can read public folders" on public.folders;
create policy "Public can read public folders"
on public.folders for select using (is_public = true);

drop policy if exists "Public can read public products" on public.products;
create policy "Public can read public products"
on public.products for select using (is_public = true);

-- Owners can read all their rows, including any private rows.
drop policy if exists "Owner can read own folders" on public.folders;
create policy "Owner can read own folders"
on public.folders for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Owner can manage own folders" on public.folders;
create policy "Owner can manage own folders"
on public.folders for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owner can read own products" on public.products;
create policy "Owner can read own products"
on public.products for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Owner can manage own products" on public.products;
create policy "Owner can manage own products"
on public.products for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Image storage:
-- In Supabase Dashboard > Storage, create a bucket named "product-images".
-- Set it to Public only if you want uploaded product images to be publicly visible.
-- Add Storage policies so only authenticated users can INSERT/UPDATE/DELETE objects.
-- Do not expose service_role keys in this website.
