/**
 * Database schema, applied at startup (idempotent). Money is stored as whole coins in bigint
 * columns; every change to a balance has a ledger row.
 */
export const SCHEMA = `
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists login_tokens (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists sessions (
  token_hash text primary key,
  player_id uuid not null references players(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists characters (
  player_id uuid primary key references players(id) on delete cascade,
  appearance jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists wallets (
  player_id uuid primary key references players(id) on delete cascade,
  balance bigint not null check (balance >= 0)
);

create table if not exists ledger (
  id bigserial primary key,
  player_id uuid not null references players(id) on delete cascade,
  amount bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  slot int not null check (slot >= 0),
  kind text not null,
  name text not null,
  equipped boolean not null default false,
  unique (player_id, slot)
);
`;
