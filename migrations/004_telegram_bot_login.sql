-- Barber sign-in through the bot instead of the Login Widget popup.
-- The browser picks a random code and a poll secret, registers sha256(secret) here, then opens
-- t.me/<bot>?start=l_<code>. The bot asks the user to confirm; the browser polls with its secret
-- and gets a Supabase magic-link token once. Only api/ (service role) touches this table.
create table if not exists telegram_login_requests (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{20,40}$'),
  secret_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'used', 'cancelled')),
  telegram_id bigint,
  username text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists telegram_login_requests_created_idx on telegram_login_requests (created_at);

alter table telegram_login_requests enable row level security;
-- No policies: anon and authenticated clients can neither read nor write login requests.
