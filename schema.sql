-- ════════════════════════════════════════════════════════════════════════════
-- RETRO VAULT — Database Schema
-- ════════════════════════════════════════════════════════════════════════════
-- This file creates the complete database structure for Retro Vault.
-- Paste this entire file into Supabase → SQL Editor → New Query → Run.
--
-- Designed for: PostgreSQL 15+ (what Supabase runs).
-- Idempotent: safe to run multiple times — uses IF NOT EXISTS / OR REPLACE.
-- ════════════════════════════════════════════════════════════════════════════

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- For fast full-text search

-- ────────────────────────────────────────────────────────────────────────────
-- ENUMS (typed constants)
-- ────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type record_format as enum (
    'vinyl', 'cd', 'cassette', 'reel_to_reel',
    'eight_track', 'minidisc', 'digital'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type record_condition as enum (
    'M', 'NM', 'VG_PLUS', 'VG', 'G_PLUS', 'G', 'F', 'P'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type custom_field_type as enum (
    'text', 'url', 'number', 'date'
  );
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- USERS — extends Supabase's built-in auth.users
-- Supabase Auth creates entries in auth.users on signup. We add a public.users
-- table for app-specific profile data, linked 1:1 via user id.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text unique,        -- optional; required only for public profiles
  display_name text,
  avatar_url text,
  bio text,
  is_public boolean not null default false, -- master toggle for public profile
  show_values_publicly boolean not null default false, -- can hide $$ even when profile is public
  discogs_token text,          -- per-user Discogs API token
  worker_url text,             -- per-user Cloudflare Worker URL for Discogs proxy
  visible_formats record_format[] default array[
    'vinyl','cd','cassette','reel_to_reel','eight_track','minidisc','digital'
  ]::record_format[],
  preferred_theme text default 'listening-room',
  preferred_mood text default 'late-night',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Username format constraint: lowercase, alphanumeric + dashes/underscores, 3-30 chars
alter table public.users drop constraint if exists username_format;
alter table public.users add constraint username_format
  check (username is null or username ~ '^[a-z0-9_-]{3,30}$');

create index if not exists users_username_idx on public.users(username) where username is not null;
create index if not exists users_email_idx on public.users(email);

-- ────────────────────────────────────────────────────────────────────────────
-- COLLECTIONS — each user can have multiple named collections
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.collections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  icon text default '💿' check (length(icon) <= 4),
  description text check (length(description) <= 200),
  is_public boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_user_id_idx on public.collections(user_id);
create index if not exists collections_user_sort_idx on public.collections(user_id, sort_order);

-- ────────────────────────────────────────────────────────────────────────────
-- RECORDS — the heart of the system
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,

  -- Core metadata
  artist text not null check (length(artist) <= 200),
  title text not null check (length(title) <= 300),
  label text check (length(label) <= 200),
  year text check (length(year) <= 12), -- text not int — supports "1973 reissue", "ca. 1965", etc.
  format record_format not null default 'vinyl',
  genre text check (length(genre) <= 100),
  condition record_condition default 'VG_PLUS',
  notes text, -- unlimited length

  -- Tags as a Postgres array — fast to query with GIN index
  tags text[] default '{}',

  -- Discogs linkage
  discogs_id text check (length(discogs_id) <= 50),

  -- Pricing — eight figures of cents = €99,999,999.99 max
  purchase_price numeric(10,2),
  value_override numeric(10,2),
  -- Prices per condition (jsonb): {"M": 180.50, "NM": 150.00, ...}
  prices jsonb default '{}'::jsonb,

  -- Images: store path in Supabase Storage, plus public URL
  image_storage_path text, -- e.g. "user-id/record-id/cover.webp"
  image_url text,          -- public URL (may be Discogs URL or Storage URL)

  -- Lifecycle flags
  is_archived boolean not null default false,
  archived_at timestamptz,
  is_pending_delete boolean not null default false,
  pending_delete_at timestamptz,
  intentional_duplicate boolean not null default false,

  -- Public visibility
  is_public boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Constraint: archived_at should be set when is_archived is true, null otherwise
alter table public.records drop constraint if exists archive_timestamp;
alter table public.records add constraint archive_timestamp
  check ((is_archived = false and archived_at is null) or
         (is_archived = true and archived_at is not null));

-- Indexes for the queries we'll run most
create index if not exists records_user_id_idx on public.records(user_id);
create index if not exists records_collection_id_idx on public.records(collection_id);
create index if not exists records_user_active_idx on public.records(user_id)
  where is_archived = false and is_pending_delete = false;
create index if not exists records_format_idx on public.records(user_id, format)
  where is_archived = false and is_pending_delete = false;
create index if not exists records_tags_idx on public.records using gin(tags);
create index if not exists records_discogs_id_idx on public.records(discogs_id)
  where discogs_id is not null;
create index if not exists records_public_idx on public.records(user_id)
  where is_public = true and is_archived = false and is_pending_delete = false;

-- Full-text search: combine artist, title, label, notes into a single searchable column
create index if not exists records_search_idx on public.records using gin (
  to_tsvector('simple',
    coalesce(artist, '') || ' ' ||
    coalesce(title, '') || ' ' ||
    coalesce(label, '') || ' ' ||
    coalesce(genre, '') || ' ' ||
    coalesce(notes, '')
  )
);

-- ────────────────────────────────────────────────────────────────────────────
-- TRACKS — separate table so we can search across tracklists globally
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.tracks (
  id uuid primary key default uuid_generate_v4(),
  record_id uuid not null references public.records(id) on delete cascade,
  position text check (length(position) <= 12), -- "A1", "B2", "1", "12"
  title text not null check (length(title) <= 300),
  duration text check (length(duration) <= 12), -- "3:42", "12:30:00"
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tracks_record_id_idx on public.tracks(record_id, sort_order);
create index if not exists tracks_title_search_idx on public.tracks using gin (
  to_tsvector('simple', coalesce(title, ''))
);

-- ────────────────────────────────────────────────────────────────────────────
-- CUSTOM FIELDS — user-defined arbitrary fields per record
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.custom_fields (
  id uuid primary key default uuid_generate_v4(),
  record_id uuid not null references public.records(id) on delete cascade,
  name text not null check (length(name) <= 100),
  value text not null check (length(value) <= 2000),
  field_type custom_field_type not null default 'text',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists custom_fields_record_id_idx on public.custom_fields(record_id, sort_order);

-- ────────────────────────────────────────────────────────────────────────────
-- TIP JAR — anonymous counter, no personal data
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.tip_jar_clicks (
  id bigserial primary key,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGERS — auto-update updated_at on row change
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists collections_updated_at on public.collections;
create trigger collections_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

drop trigger if exists records_updated_at on public.records;
create trigger records_updated_at before update on public.records
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGER — auto-create public.users row when auth.users row is created
-- This means: a magic-link signup automatically creates the app profile.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS) — multi-tenant isolation
-- Without RLS, any logged-in user could query any other user's data.
-- With RLS, the database itself enforces "you can only see your own rows".
-- ────────────────────────────────────────────────────────────────────────────

alter table public.users enable row level security;
alter table public.collections enable row level security;
alter table public.records enable row level security;
alter table public.tracks enable row level security;
alter table public.custom_fields enable row level security;
alter table public.tip_jar_clicks enable row level security;

-- ── USERS table policies ────────────────────────────────────────────────────
drop policy if exists "users_read_self" on public.users;
create policy "users_read_self" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_read_public_profile" on public.users;
create policy "users_read_public_profile" on public.users
  for select using (is_public = true);

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self" on public.users
  for update using (auth.uid() = id);

-- ── COLLECTIONS table policies ──────────────────────────────────────────────
drop policy if exists "collections_owner_all" on public.collections;
create policy "collections_owner_all" on public.collections
  for all using (auth.uid() = user_id);

drop policy if exists "collections_read_public" on public.collections;
create policy "collections_read_public" on public.collections
  for select using (
    is_public = true
    and exists (
      select 1 from public.users
      where users.id = collections.user_id and users.is_public = true
    )
  );

-- ── RECORDS table policies ──────────────────────────────────────────────────
drop policy if exists "records_owner_all" on public.records;
create policy "records_owner_all" on public.records
  for all using (auth.uid() = user_id);

drop policy if exists "records_read_public" on public.records;
create policy "records_read_public" on public.records
  for select using (
    is_public = true
    and is_archived = false
    and is_pending_delete = false
    and exists (
      select 1 from public.users
      where users.id = records.user_id and users.is_public = true
    )
  );

-- ── TRACKS table policies — inherit from parent record ──────────────────────
drop policy if exists "tracks_via_record" on public.tracks;
create policy "tracks_via_record" on public.tracks
  for all using (
    exists (
      select 1 from public.records
      where records.id = tracks.record_id and records.user_id = auth.uid()
    )
  );

drop policy if exists "tracks_read_public" on public.tracks;
create policy "tracks_read_public" on public.tracks
  for select using (
    exists (
      select 1 from public.records r
      join public.users u on u.id = r.user_id
      where r.id = tracks.record_id
        and r.is_public = true and r.is_archived = false
        and u.is_public = true
    )
  );

-- ── CUSTOM FIELDS — same pattern ────────────────────────────────────────────
drop policy if exists "custom_fields_via_record" on public.custom_fields;
create policy "custom_fields_via_record" on public.custom_fields
  for all using (
    exists (
      select 1 from public.records
      where records.id = custom_fields.record_id and records.user_id = auth.uid()
    )
  );

drop policy if exists "custom_fields_read_public" on public.custom_fields;
create policy "custom_fields_read_public" on public.custom_fields
  for select using (
    exists (
      select 1 from public.records r
      join public.users u on u.id = r.user_id
      where r.id = custom_fields.record_id
        and r.is_public = true and r.is_archived = false
        and u.is_public = true
    )
  );

-- ── TIP JAR — anyone can insert (record a tip click), no one can read ──────
drop policy if exists "tip_jar_insert_anon" on public.tip_jar_clicks;
create policy "tip_jar_insert_anon" on public.tip_jar_clicks
  for insert with check (true);

-- ────────────────────────────────────────────────────────────────────────────
-- STORAGE — bucket for cover art
-- This needs to be done via Supabase dashboard OR via these statements:
-- ────────────────────────────────────────────────────────────────────────────

-- Note: these are dashboard-only or require service_role privileges to run.
-- They're commented out here for reference. Run them in the Storage section
-- of the Supabase dashboard, or via the API.

-- insert into storage.buckets (id, name, public) values ('covers', 'covers', true)
--   on conflict (id) do nothing;
--
-- create policy "covers_user_upload" on storage.objects
--   for insert with check (
--     bucket_id = 'covers'
--     and (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- create policy "covers_user_update" on storage.objects
--   for update using (
--     bucket_id = 'covers'
--     and (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- create policy "covers_user_delete" on storage.objects
--   for delete using (
--     bucket_id = 'covers'
--     and (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- create policy "covers_public_read" on storage.objects
--   for select using (bucket_id = 'covers');

-- ════════════════════════════════════════════════════════════════════════════
-- Schema complete. Verify with: \dt public.*
-- ════════════════════════════════════════════════════════════════════════════
