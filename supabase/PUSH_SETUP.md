# Web Push setup

The app includes the browser opt-in, service-worker notification display, subscription API, and database-triggered sender. Push delivery starts after the Supabase SQL, function, and VAPID secrets are configured.

1. Generate one VAPID key pair, for example with `npx web-push generate-vapid-keys`. Keep the private key out of the repository. The public key can be shared with browsers.
2. Run [`push_notifications.sql`](push_notifications.sql) in the Supabase SQL editor. It creates service-role-only subscription and delivery tables.
3. Set Edge Function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` address or HTTPS URL you control). For example, use `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com --project-ref YOUR_REF`.
4. Deploy `supabase functions deploy clashe-push --project-ref YOUR_REF`. Keep JWT verification enabled, since signed-in clients invoke the function.
5. Add these encrypted values in Supabase Vault using the SQL editor:

   ```sql
   select vault.create_secret('https://YOUR_REF.supabase.co', 'clashe_push_project_url');
   select vault.create_secret('YOUR_LEGACY_SERVICE_ROLE_JWT', 'clashe_push_service_key');
   ```

   Use the project's legacy `service_role` JWT for this webhook because the function's JWT gate expects a JWT in the Authorization header. Never commit or expose that value in browser code.

6. Run [`push_webhook.sql`](push_webhook.sql). This adds an asynchronous `pg_net` trigger on notification inserts, so delivery does not depend on the sender keeping the app open. The client call also provides a fallback; the delivery table prevents duplicates.

Test with two accounts and a second installed device: enable App Notifications in Settings on the recipient device, close the app, then have the other account follow or comment. A system notification should appear and open the relevant profile or take. On iPhone and iPad, open the installed Home Screen app before enabling notifications. Browser permission must be granted from the user's tap; the app never requests it automatically.

Expired browser subscriptions are removed after a 404/410 response. The device's subscription is removed on opt-out or sign-out. Periodically prune old rows from `push_deliveries` with the maintenance query in `push_notifications.sql`.
