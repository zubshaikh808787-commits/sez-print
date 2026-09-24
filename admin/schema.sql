-- Postgres shape for the SEZ Print desk.
-- The running desk uses admin/data/store.json until RDS is connected.

create table admins (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null
);

create table devices (
  id text primary key,
  model text not null,
  platform text not null,
  first_seen timestamptz not null,
  last_seen timestamptz not null
);

create table templates (
  id text primary key,
  name text not null,
  category text not null,
  width_mm numeric not null,
  height_mm numeric not null,
  preview_url text not null,
  document jsonb not null,
  status text not null check (status in ('draft', 'published')),
  featured boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table assets (
  id text primary key,
  kind text not null check (kind in ('clipart', 'sticker')),
  name text not null,
  file_url text not null,
  mime text not null,
  created_at timestamptz not null
);

create table print_events (
  id text primary key,
  device_id text not null references devices (id),
  template_id text not null,
  printer text not null check (printer in ('dev', 'labelx', 'tez', 'td404', 'josh')),
  at timestamptz not null
);

create table reviews (
  id text primary key,
  rating int not null check (rating between 1 and 5),
  text text not null,
  template_id text not null,
  device_id text not null,
  created_at timestamptz not null
);

create table suggestions (
  id text primary key,
  text text not null,
  device_id text not null,
  status text not null check (status in ('new', 'reviewing', 'planned', 'rejected', 'shipped')),
  note text not null default '',
  created_at timestamptz not null
);
