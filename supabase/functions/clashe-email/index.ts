// Supabase Edge Function: clashe-email (powered by Gmail REST API)
// Uses Google OAuth2 Refresh Token over standard HTTPS REST API
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WelcomePayload {
  type: "welcome";
  email: string;
  username: string;
  userId?: string;
  appUrl?: string;
}

interface NotificationPayload {
  type: "notification";
  recipientId: string;
  actorId: string;
  notificationType: "follow" | "comment" | "reply" | "comment_like" | "bookmark";
  targetTakeId?: string;
  targetCommentId?: string;
  metadata?: {
    actorUsername?: string;
    takeTitle?: string;
    commentSnippet?: string;
  };
  appUrl?: string;
}

type RequestBody = WelcomePayload | NotificationPayload;

// Cached access token in Edge Runtime memory
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getGmailAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh Google OAuth token: ${res.status} ${errText}`);
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedAccessToken as string;
}

// Convert string to base64url safely in Deno / UTF-8
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Send email via Gmail REST API
async function sendGmailRest(params: {
  accessToken: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
}) {
  const { accessToken, fromEmail, to, subject, html } = params;

  // Encode subject in MIME UTF-8
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  const rawMessage = [
    `From: Clashe <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
  ].join("\r\n");

  const raw = base64UrlEncode(rawMessage);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail API error (${res.status}): ${errText}`);
  }

  return await res.json();
}

function escapeHtml(str?: string | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID") || "";
    const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET") || "";
    const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN") || "";
    const GMAIL_USER = Deno.env.get("GMAIL_USER") || "clashe654@gmail.com";

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SERVICE_ROLE_KEY");

    let supabaseAdmin = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    }

    const body: RequestBody = await req.json();
    const appUrl = (body.appUrl || "https://clashe.vercel.app").replace(/\/$/, "");

    console.log("[gmail-rest] Handling email request for type:", body.type);

    // Refresh Google access token
    const accessToken = await getGmailAccessToken(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REFRESH_TOKEN
    );

    if (body.type === "welcome") {
      const { email, username } = body;
      if (!email || !username) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: email and username" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[gmail-rest] Sending welcome email to ${email} (@${username})`);
      const subject = `Welcome to the floor, @${username}! 🔥`;
      const htmlContent = buildWelcomeEmailHtml({ username, appUrl });

      const sendRes = await sendGmailRest({
        accessToken,
        fromEmail: GMAIL_USER,
        to: email,
        subject,
        html: htmlContent,
      });

      console.log(`[gmail-rest] Welcome email delivered successfully to ${email}. ID:`, sendRes.id);
      return new Response(
        JSON.stringify({ success: true, message: "Welcome email sent", id: sendRes.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.type === "notification") {
      const { recipientId, actorId, notificationType, targetTakeId } = body;
      if (!recipientId || !actorId || !notificationType) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: recipientId, actorId, notificationType" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!supabaseAdmin) {
        console.error("[gmail-rest] SUPABASE_SERVICE_ROLE_KEY missing, cannot resolve recipient email.");
        return new Response(
          JSON.stringify({ error: "Service role key missing to look up recipient email." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check recipient preferences
      try {
        const { data: prefData } = await supabaseAdmin
          .from("user_email_preferences")
          .select("email_notifications_enabled, email_on_follow, email_on_comment, email_on_reply, email_on_like")
          .eq("user_id", recipientId)
          .maybeSingle();

        if (prefData) {
          if (!prefData.email_notifications_enabled) {
            return new Response(JSON.stringify({ skipped: true, reason: "notifications_disabled" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (notificationType === "follow" && prefData.email_on_follow === false) {
            return new Response(JSON.stringify({ skipped: true, reason: "follow_disabled" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (_e) {}

      // Fetch recipient email
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(recipientId);
      if (userError || !userData?.user?.email) {
        console.error("[gmail-rest] Recipient email lookup failed:", userError);
        return new Response(
          JSON.stringify({ error: "Recipient email not found", details: userError }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const recipientEmail = userData.user.email;

      // Fetch actor username
      let actorUsername = body.metadata?.actorUsername || "";
      if (!actorUsername) {
        const { data: actorProfile } = await supabaseAdmin
          .from("profiles")
          .select("username")
          .eq("id", actorId)
          .maybeSingle();
        actorUsername = actorProfile?.username || "Someone";
      }

      const { subject, eyebrow, title, detail, actionText, actionUrl, badgeText, badgeColor } = formatNotificationCopy({
        notificationType,
        actorUsername,
        targetTakeId,
        appUrl,
        takeTitle: body.metadata?.takeTitle,
        commentSnippet: body.metadata?.commentSnippet,
      });

      const htmlContent = buildNotificationEmailHtml({
        actorUsername,
        eyebrow,
        title,
        detail,
        actionText,
        actionUrl,
        badgeText,
        badgeColor,
        appUrl,
      });

      console.log(`[gmail-rest] Sending ${notificationType} email to ${recipientEmail} via Gmail REST API`);
      const sendRes = await sendGmailRest({
        accessToken,
        fromEmail: GMAIL_USER,
        to: recipientEmail,
        subject,
        html: htmlContent,
      });

      console.log(`[gmail-rest] Notification email sent successfully to ${recipientEmail}. ID:`, sendRes.id);
      return new Response(
        JSON.stringify({ success: true, recipient: recipientEmail, id: sendRes.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid type specified." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[gmail-rest] Error sending email:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function formatNotificationCopy(params: {
  notificationType: string;
  actorUsername: string;
  targetTakeId?: string;
  appUrl: string;
  takeTitle?: string;
  commentSnippet?: string;
}) {
  const { notificationType, actorUsername, targetTakeId, appUrl, takeTitle, commentSnippet } = params;
  const takeUrl = targetTakeId ? `${appUrl}/take.html?id=${targetTakeId}` : `${appUrl}/index.html`;
  const profileUrl = `${appUrl}/user.html?username=${encodeURIComponent(actorUsername)}`;

  switch (notificationType) {
    case "follow":
      return {
        subject: `@${actorUsername} started following you on Clashe`,
        eyebrow: "New Follower",
        title: `@${actorUsername} is now following your takes`,
        detail: `They'll see your takes on their Following feed going forward.`,
        actionText: "View Profile",
        actionUrl: profileUrl,
        badgeText: "Follow",
        badgeColor: "#282b33",
      };
    case "comment":
      return {
        subject: `@${actorUsername} commented on your take`,
        eyebrow: "New Comment",
        title: `@${actorUsername} commented on your take`,
        detail: commentSnippet
          ? `&ldquo;${escapeHtml(commentSnippet)}&rdquo;`
          : takeTitle
          ? `On your take: &ldquo;${escapeHtml(takeTitle)}&rdquo;`
          : "They joined the debate on your take. See what they said.",
        actionText: "View Discussion",
        actionUrl: takeUrl,
        badgeText: "Comment",
        badgeColor: "#282b33",
      };
    case "reply":
      return {
        subject: `@${actorUsername} replied to your comment`,
        eyebrow: "Thread Reply",
        title: `@${actorUsername} replied to your comment`,
        detail: commentSnippet
          ? `&ldquo;${escapeHtml(commentSnippet)}&rdquo;`
          : "The clash is heating up. Jump back in to hold your ground.",
        actionText: "View Reply",
        actionUrl: takeUrl,
        badgeText: "Reply",
        badgeColor: "#282b33",
      };
    case "comment_like":
      return {
        subject: `@${actorUsername} liked your comment`,
        eyebrow: "Community Reaction",
        title: `@${actorUsername} liked your comment`,
        detail: `Your point resonated with the community on Clashe.`,
        actionText: "View Comment",
        actionUrl: takeUrl,
        badgeText: "Like",
        badgeColor: "#282b33",
      };
    case "bookmark":
      return {
        subject: `@${actorUsername} bookmarked your take`,
        eyebrow: "Take Saved",
        title: `@${actorUsername} bookmarked your take`,
        detail: takeTitle ? `&ldquo;${escapeHtml(takeTitle)}&rdquo;` : "Your take was saved to their personal collection.",
        actionText: "View Take",
        actionUrl: takeUrl,
        badgeText: "Saved",
        badgeColor: "#282b33",
      };
    default:
      return {
        subject: `New activity from @${actorUsername} on Clashe`,
        eyebrow: "Activity",
        title: `@${actorUsername} interacted with you`,
        detail: "There is new activity on your Clashe profile.",
        actionText: "Open Clashe",
        actionUrl: appUrl,
        badgeText: "Update",
        badgeColor: "#282b33",
      };
  }
}

function buildWelcomeEmailHtml(params: { username: string; appUrl: string }) {
  const { username, appUrl } = params;
  const safeUsername = escapeHtml(username);
  const homeUrl = escapeHtml(`${appUrl}/index.html`);
  const createUrl = escapeHtml(`${appUrl}/create.html`);
  const settingsUrl = escapeHtml(`${appUrl}/settings.html`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Welcome to Clashe</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet">
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    :root { color-scheme: dark; supported-color-schemes: dark; }
    body {
      margin: 0 !important; padding: 0 !important; width: 100% !important;
      -webkit-text-size-adjust: 100% !important; -ms-text-size-adjust: 100% !important;
      background-color: #0a0a0b !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      color: #eeeef1 !important;
    }
    table, td { border-collapse: collapse !important; mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
    img { border: 0 !important; outline: none !important; text-decoration: none !important; }
    a { text-decoration: none; }
    .serif { font-family: 'Playfair Display', Georgia, 'Times New Roman', serif !important; }
    @media only screen and (max-width: 600px) {
      .shell { width: 100% !important; border-radius: 0 !important; }
      .pad { padding: 28px 20px !important; }
      .feat-cell { display: block !important; width: 100% !important; padding-right: 0 !important; padding-bottom: 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0b;">
  <div style="display:none;max-height:0;overflow:hidden;">
    Your account is live on Clashe. Step onto the floor and join the debate.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0a0a0b;padding:48px 16px;">
    <tr>
      <td align="center" valign="top">
        <table class="shell" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#141517;border:1px solid #282b33;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #1f2127;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle">
                    <a href="${homeUrl}" target="_blank" style="text-decoration:none;display:inline-block;">
                      <img src="https://clashe.vercel.app/assets/clashly-mark-white.svg" alt="Clashe" width="48" height="32" style="display:block;border:0;outline:none;width:48px;height:32px;">
                    </a>
                  </td>
                  <td align="right" valign="middle">
                    <span style="font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:#50535e;letter-spacing:0.08em;text-transform:uppercase;">Welcome</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="pad" style="padding:40px 36px 36px;">

              <p style="margin:0 0 14px;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#888b96;">You&rsquo;re in</p>

              <h1 class="serif" style="margin:0 0 18px;font-family:'Playfair Display',Georgia,serif;font-size:34px;line-height:1.12;font-weight:700;color:#ffffff;letter-spacing:-0.03em;">
                Welcome to the floor,<br>@${safeUsername}.
              </h1>

              <p style="margin:0 0 32px;font-family:'Inter',sans-serif;font-size:15px;line-height:1.65;color:#888b96;">
                Clashe is where bold opinions meet real-time public judgment. Share your stance, clash with other minds, vote on controversies, and see where the community stands.
              </p>

              <!-- CTA buttons -->
              <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom:36px;">
                <tr>
                  <td align="center" style="background-color:#eeeef1;border-radius:999px;">
                    <a href="${homeUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;color:#0a0a0b;text-decoration:none;border-radius:999px;letter-spacing:-0.02em;">
                      Enter Clashe &rarr;
                    </a>
                  </td>
                  <td style="padding-left:12px;">
                    <a href="${createUrl}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#888b96;text-decoration:none;border:1px solid #282b33;border-radius:999px;">
                      Post a Take
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Features -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-top:1px solid #1f2127;padding-top:28px;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td class="feat-cell" width="33%" align="left" valign="top" style="padding-right:16px;">
                          <div style="font-size:18px;margin-bottom:8px;">&#128293;</div>
                          <div style="font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:#eeeef1;margin-bottom:4px;letter-spacing:-0.02em;">Drop Takes</div>
                          <div style="font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;color:#50535e;">Publish bold opinions and watch live verdicts roll in.</div>
                        </td>
                        <td class="feat-cell" width="33%" align="left" valign="top" style="padding-right:16px;">
                          <div style="font-size:18px;margin-bottom:8px;">&#9878;&#65039;</div>
                          <div style="font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:#eeeef1;margin-bottom:4px;letter-spacing:-0.02em;">Cast Verdicts</div>
                          <div style="font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;color:#50535e;">Agree or disagree. Every vote shifts the needle.</div>
                        </td>
                        <td class="feat-cell" width="33%" align="left" valign="top">
                          <div style="font-size:18px;margin-bottom:8px;">&#127942;</div>
                          <div style="font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:#eeeef1;margin-bottom:4px;letter-spacing:-0.02em;">Build Clout</div>
                          <div style="font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;color:#50535e;">Win debates, grow followers, and rank on top charts.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #1f2127;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" style="font-family:'Inter',sans-serif;font-size:11px;color:#50535e;line-height:1.6;">
                    Sent by <strong style="color:#888b96;">Clashe</strong> &bull; You received this because you signed up.
                  </td>
                  <td align="right" valign="top">
                    <a href="${settingsUrl}" target="_blank" style="font-family:'Inter',sans-serif;font-size:11px;color:#888b96;text-decoration:underline;">Email settings</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildNotificationEmailHtml(params: {
  actorUsername: string;
  eyebrow: string;
  title: string;
  detail: string;
  actionText: string;
  actionUrl: string;
  badgeText: string;
  badgeColor: string;
  appUrl: string;
}) {
  const { actorUsername, eyebrow, title, detail, actionText, actionUrl, appUrl } = params;
  const safeActorUsername = escapeHtml(actorUsername);
  const safeTitle = escapeHtml(title);
  const safeEyebrow = escapeHtml(eyebrow);
  const homeUrl = escapeHtml(`${appUrl}/index.html`);
  const safeActionUrl = escapeHtml(actionUrl);
  const settingsUrl = escapeHtml(`${appUrl}/settings.html`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet">
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    :root { color-scheme: dark; supported-color-schemes: dark; }
    body {
      margin: 0 !important; padding: 0 !important; width: 100% !important;
      -webkit-text-size-adjust: 100% !important; -ms-text-size-adjust: 100% !important;
      background-color: #0a0a0b !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      color: #eeeef1 !important;
    }
    table, td { border-collapse: collapse !important; mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
    img { border: 0 !important; outline: none !important; text-decoration: none !important; }
    a { text-decoration: none; }
    .serif { font-family: 'Playfair Display', Georgia, 'Times New Roman', serif !important; }
    @media only screen and (max-width: 600px) {
      .shell { width: 100% !important; border-radius: 0 !important; }
      .pad { padding: 28px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0b;">
  <div style="display:none;max-height:0;overflow:hidden;">
    ${safeTitle} on Clashe.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0a0a0b;padding:48px 16px;">
    <tr>
      <td align="center" valign="top">
        <table class="shell" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:540px;background-color:#141517;border:1px solid #282b33;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:20px 28px;border-bottom:1px solid #1f2127;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle">
                    <a href="${homeUrl}" target="_blank" style="text-decoration:none;display:inline-block;">
                      <img src="https://clashe.vercel.app/assets/clashly-mark-white.svg" alt="Clashe" width="44" height="29" style="display:block;border:0;outline:none;width:44px;height:29px;">
                    </a>
                  </td>
                  <td align="right" valign="middle">
                    <span style="font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:#50535e;letter-spacing:0.08em;text-transform:uppercase;">${safeEyebrow}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="pad" style="padding:32px 30px 28px;">

              <!-- Actor row -->
              <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom:22px;">
                <tr>
                  <td style="width:42px;height:42px;border-radius:50%;background-color:#1a1b1f;border:1px solid #282b33;text-align:center;vertical-align:middle;font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:700;color:#eeeef1;">${safeActorUsername.charAt(0).toUpperCase()}</td>
                  <td style="padding-left:13px;">
                    <div style="font-family:'Inter',sans-serif;font-size:14px;font-weight:700;color:#eeeef1;">@${safeActorUsername}</div>
                    <div style="font-family:'Inter',sans-serif;font-size:12px;color:#50535e;margin-top:1px;">on Clashe</div>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <h2 class="serif" style="margin:0 0 14px;font-family:'Playfair Display',Georgia,serif;font-size:24px;line-height:1.25;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                ${safeTitle}
              </h2>

              <!-- Detail -->
              <div style="padding:14px 18px;background-color:#1a1b1f;border:1px solid #282b33;border-radius:10px;margin-bottom:26px;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#888b96;">
                ${detail}
              </div>

              <!-- CTA -->
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="background-color:#eeeef1;border-radius:999px;">
                    <a href="${safeActionUrl}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;color:#0a0a0b;text-decoration:none;border-radius:999px;letter-spacing:-0.02em;">
                      ${escapeHtml(actionText)} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 30px;border-top:1px solid #1f2127;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" style="font-family:'Inter',sans-serif;font-size:11px;color:#50535e;line-height:1.5;">
                    Sent by <strong style="color:#888b96;">Clashe</strong>
                  </td>
                  <td align="right" valign="top">
                    <a href="${settingsUrl}" target="_blank" style="font-family:'Inter',sans-serif;font-size:11px;color:#888b96;text-decoration:underline;">Email settings</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
