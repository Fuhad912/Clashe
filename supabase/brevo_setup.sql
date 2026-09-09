-- ==============================================================================
-- CLASHE — BREVO EMAIL SETUP & NOTIFICATION PREFERENCES
-- Run this in your Supabase SQL Editor to enable email preferences.
-- (If you already ran the previous table creation, this will safely keep existing preferences!)
-- ==============================================================================

-- 1. Create user email preferences table
create table if not exists public.user_email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_notifications_enabled boolean not null default true,
  email_on_follow boolean not null default true,
  email_on_comment boolean not null default true,
  email_on_reply boolean not null default true,
  email_on_like boolean not null default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS)
alter table public.user_email_preferences enable row level security;

-- 3. RLS Policies
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'user_email_preferences' and policyname = 'Users can view own email preferences'
  ) then
    create policy "Users can view own email preferences"
      on public.user_email_preferences
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'user_email_preferences' and policyname = 'Users can insert own email preferences'
  ) then
    create policy "Users can insert own email preferences"
      on public.user_email_preferences
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'user_email_preferences' and policyname = 'Users can update own email preferences'
  ) then
    create policy "Users can update own email preferences"
      on public.user_email_preferences
      for update
      using (auth.uid() = user_id);
  end if;
end $$;

-- 4. Automatically initialize preferences when a profile is created
create or replace function public.handle_new_user_email_preferences()
returns trigger as $$
begin
  insert into public.user_email_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_created_email_prefs on public.profiles;
create trigger on_profile_created_email_prefs
  after insert on public.profiles
  for each row execute function public.handle_new_user_email_preferences();
