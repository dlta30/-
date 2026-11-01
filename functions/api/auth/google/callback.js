import { newId } from "../../../_lib/http.js";
import { createSession } from "../../../_lib/auth.js";

function randomBase64(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function cookie(request, name) {
  const item = (request.headers.get("Cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}
function fail(request, reason) {
  const target = new URL("/", request.url);
  target.searchParams.set("google_error", reason);
  return new Response(null, { status: 302, headers: {
    location: target.toString(),
    "set-cookie": "google_oauth_state=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  }});
}
async function handleGoogleCallback({ request, env }, markStage) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = cookie(request, "google_oauth_state");
  if (!code || !state || !saved || state !== saved) return fail(request, "state");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail(request, "config");

  const redirectUri = url.origin + "/api/auth/google/callback";
  markStage("token_exchange");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: "authorization_code"
    })
  });
  markStage("token_response");
  if (!tokenRes.ok) return fail(request, "token");
  markStage("token_parse");
  const tokens = await tokenRes.json();
  if (!tokens.id_token) return fail(request, "identity");
  markStage("identity_check");
  const infoRes = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(tokens.id_token));
  if (!infoRes.ok) return fail(request, "identity");
  markStage("identity_parse");
  const info = await infoRes.json();
  const issuerOk = info.iss === "https://accounts.google.com" || info.iss === "accounts.google.com";
  if (info.aud !== env.GOOGLE_CLIENT_ID || !issuerOk || Number(info.exp) * 1000 <= Date.now() ||
      info.email_verified !== "true" || !info.email) return fail(request, "identity");

  markStage("database_lookup");
  const email = String(info.email).trim().toLowerCase();
  let user = await env.DB.prepare("SELECT id,name,email,role,active FROM users WHERE email=?").bind(email).first();
  let needsPasswordSetup = false;
  if (user && !user.active) return fail(request, "disabled");
  markStage("user_create");
  if (!user) {
    needsPasswordSetup = true;
    const id = newId();
    const name = String(info.name || info.given_name || email.split("@")[0]).trim().slice(0, 80) || "طالب";
    const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(48)), b => b.toString(16).padStart(2, "0")).join("");
    // Google-only account: store an unguessable, valid-format password pair.
    // No password is known or accepted for this account; authentication is via Google.
    markStage("password_hash");
    const salt = randomBase64(16);
    const hash = randomBase64(32);
    markStage("user_insert");
    try {
      await env.DB.prepare("INSERT INTO users (id,name,email,password_hash,password_salt,role) VALUES (?,?,?,?,?,'student')")
        .bind(id, name, email, hash, salt).run();
      user = { id, name, email, role: "student", active: 1 };
    } catch (insertError) {
      markStage("user_insert_recovery");
      user = await env.DB.prepare("SELECT id,name,email,role,active FROM users WHERE email=?").bind(email).first();
      if (!user || !user.active) {
        console.error("Google student insert failed:", insertError?.message || insertError);
        return fail(request, "account");
      }
    }
  }

  markStage("session_create");
  const session = await createSession(env.DB, user.id);
  const destination = new URL("/", request.url);
  if (needsPasswordSetup) destination.searchParams.set("google_setup", "1");
  const headers = new Headers({ location: destination.toString(), "set-cookie": session });
  headers.append("set-cookie", "google_oauth_state=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet(context) {
  let stage = "start";
  try {
    return await handleGoogleCallback(context, value => { stage = value; });
  } catch (error) {
    console.error("Google OAuth callback failed at " + stage + ":", error?.stack || error);
    const response = fail(context.request, "server");
    const target = new URL(response.headers.get("location"));
    target.searchParams.set("stage", stage);
    return new Response(null, { status: 302, headers: { location: target.toString(), "set-cookie": response.headers.get("set-cookie") || "" } });
  }
}
