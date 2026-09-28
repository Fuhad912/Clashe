-- Run after push_notifications.sql and after adding these two Vault secrets:
--   clashe_push_project_url: https://YOUR_PROJECT_REF.supabase.co
--   clashe_push_service_key: your legacy service_role JWT (never commit its value)
-- The trigger queues delivery after a notification row is committed, even if
-- the browser that created the notification closes immediately afterward.
create extension if not exists pg_net with schema extensions;

create or replace function public.queue_clashe_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url
    from vault.decrypted_secrets where name = 'clashe_push_project_url' limit 1;
  select decrypted_secret into service_key
    from vault.decrypted_secrets where name = 'clashe_push_service_key' limit 1;
  if project_url is null or service_key is null then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/clashe-push',
    body := jsonb_build_object('action', 'send', 'notificationId', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key,
      'Authorization', 'Bearer ' || service_key
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.queue_clashe_push() from public, anon, authenticated;

drop trigger if exists on_notification_created_push on public.notifications;
create trigger on_notification_created_push
  after insert on public.notifications
  for each row execute function public.queue_clashe_push();
