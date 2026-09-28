// Web Push delivery for stored Clashe notifications.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: address).
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value: unknown, max = 256): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getServerConfig() {
  return {
    url: Deno.env.get("SUPABASE_URL") || "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    publicKey: Deno.env.get("VAPID_PUBLIC_KEY") || "",
    privateKey: Deno.env.get("VAPID_PRIVATE_KEY") || "",
    subject: Deno.env.get("VAPID_SUBJECT") || "",
  };
}

function isPushConfigured(config: ReturnType<typeof getServerConfig>): boolean {
  return Boolean(config.url && config.anonKey && config.serviceKey && config.publicKey && config.privateKey &&
    /^(mailto:|https:\/\/)/.test(config.subject));
}

function notificationUrl(row: Record<string, unknown>): string {
  if (row.type === "follow") return `profile.html?id=${encodeURIComponent(clean(row.actor_id, 128))}`;
  const takeId = clean(row.target_take_id || row.target_id, 128);
  const commentId = clean(row.target_comment_id, 128);
  if (!takeId) return "notifications.html";
  const url = `take.html?id=${encodeURIComponent(takeId)}`;
  return commentId ? `${url}&commentId=${encodeURIComponent(commentId)}` : url;
}

function notificationBody(row: Record<string, unknown>, username: string): string {
  const actor = username ? `@${username}` : "Someone";
  const messages: Record<string, string> = {
    follow: `${actor} followed you.`,
    comment: `${actor} commented on your take.`,
    reply: `${actor} replied to your comment.`,
    bookmark: `${actor} saved your take.`,
    comment_like: `${actor} liked your comment.`,
  };
  return messages[String(row.type)] || `${actor} interacted with your account.`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const config = getServerConfig();
  if (request.method === "GET") {
    return json({ configured: isPushConfigured(config), publicKey: isPushConfigured(config) ? config.publicKey : "" });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!isPushConfigured(config)) return json({ error: "Push delivery is not configured." }, 503);

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return json({ error: "Sign in required." }, 401);
  const serviceCaller = token === config.serviceKey;
  let userId = "";
  if (!serviceCaller) {
    const authClient = createClient(config.url, config.anonKey, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid session." }, 401);
    userId = user.id;
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch (_) {
    return json({ error: "Invalid request body." }, 400);
  }
  const admin = createClient(config.url, config.serviceKey, { auth: { persistSession: false } });
  const action = clean(input.action, 32);
  if (serviceCaller && action !== "send") return json({ error: "Unknown action." }, 400);

  if (action === "subscribe") {
    const subscription = input.subscription as Record<string, unknown> | undefined;
    const keys = subscription?.keys as Record<string, unknown> | undefined;
    const endpoint = clean(subscription?.endpoint, 2048);
    const p256dh = clean(keys?.p256dh, 256);
    const authSecret = clean(keys?.auth, 256);
    if (!endpoint.startsWith("https://") || !p256dh || !authSecret) {
      return json({ error: "Invalid push subscription." }, 400);
    }
    const { error } = await admin.from("push_subscriptions").upsert({
      endpoint, user_id: userId, p256dh, auth_secret: authSecret, updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    return error ? json({ error: "Could not save subscription." }, 500) : json({ enabled: true });
  }

  if (action === "unsubscribe") {
    const endpoint = clean(input.endpoint, 2048);
    if (!endpoint) return json({ error: "Missing endpoint." }, 400);
    const { error } = await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userId);
    return error ? json({ error: "Could not remove subscription." }, 500) : json({ enabled: false });
  }

  if (action !== "send") return json({ error: "Unknown action." }, 400);
  const notificationId = clean(input.notificationId, 128);
  if (!notificationId) return json({ error: "Missing notification." }, 400);
  const { data: row, error: rowError } = await admin.from("notifications").select("*").eq("id", notificationId).maybeSingle();
  if (rowError || !row || (!serviceCaller && row.actor_id !== userId)) return json({ error: "Notification not found." }, 404);
  const age = Date.now() - Date.parse(row.created_at || "");
  if (!Number.isFinite(age) || age < -60_000 || age > 10 * 60_000) {
    return json({ error: "Notification is too old to send." }, 400);
  }

  const { data: subscriptions, error: subscriptionsError } = await admin.from("push_subscriptions")
    .select("endpoint, p256dh, auth_secret").eq("user_id", row.user_id).limit(20);
  if (subscriptionsError) return json({ error: "Could not load subscriptions." }, 500);
  if (!subscriptions?.length) return json({ sent: 0 });

  const { data: actor } = await admin.from("profiles").select("username").eq("id", row.actor_id).maybeSingle();
  if (row.type === "comment_like" && !row.target_take_id) {
    const commentId = clean(row.target_comment_id || row.target_id, 128);
    if (commentId) {
      const { data: comment } = await admin.from("comments").select("take_id").eq("id", commentId).maybeSingle();
      if (comment?.take_id) row.target_take_id = comment.take_id;
    }
  }
  const payload = JSON.stringify({
    id: row.id,
    title: "Clashe",
    body: notificationBody(row, clean(actor?.username, 50)),
    url: notificationUrl(row),
  });
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  let sent = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    const endpoint = subscription.endpoint;
    const { error: claimError } = await admin.from("push_deliveries").insert({ notification_id: String(row.id), endpoint });
    if (claimError) return; // A prior request already claimed this device.
    try {
      await webpush.sendNotification({
        endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
      }, payload, { TTL: 3600, urgency: "normal" });
      sent += 1;
    } catch (error) {
      const status = Number((error as { statusCode?: number }).statusCode || 0);
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
      } else {
        // Allow a retry after a transient delivery failure.
        await admin.from("push_deliveries").delete().eq("notification_id", String(row.id)).eq("endpoint", endpoint);
      }
      console.warn("[Clashe Push] Delivery failed:", status || "network error");
    }
  }));
  return json({ sent });
});
