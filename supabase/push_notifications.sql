-- Run once in the Supabase SQL editor before deploying clashe-push.
-- Subscriptions contain browser delivery secrets and are only accessible to the service role.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_endpoint_https check (endpoint like 'https://%')
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

-- One delivery attempt per notification and device, even if a client retries.
create table if not exists public.push_deliveries (
  notification_id text not null,
  endpoint text not null,
  created_at timestamptz not null default now(),
  primary key (notification_id, endpoint)
);

create index if not exists push_deliveries_created_at_idx
  on public.push_deliveries (created_at);

alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant all on public.push_deliveries to service_role;

-- Delivery records are only needed long enough to prevent client retries.
-- Run periodically if pg_cron is available, or as routine maintenance:
-- delete from public.push_deliveries where created_at < now() - interval '30 days';
