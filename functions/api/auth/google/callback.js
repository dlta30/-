import { newId } from "../../../_lib/http.js";
import { hashPassword, createSession } from "../../../_lib/auth.js";

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
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = cookie(request, "google_oauth_state");
  if (!code || !state || !saved || state !== saved) return fail(request, "state");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail(request, "config");

  const redirectUri = url.origin + "/api/auth/google/callback";
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: "authorization_code"
    })
  });
  if (!tokenRes.ok) return fail(request, "token");
  const tokens = await tokenRes.json();
  if (!tokens.id_token) return fail(request, "identity");
  const infoRes = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(tokens.id_token));
  if (!infoRes.ok) return fail(request, "identity");
  const info = await infoRes.json();
  const issuerOk = info.iss === "https://accounts.google.com" || info.iss === "accounts.google.com";
  if (info.aud !== env.GOOGLE_CLIENT_ID || !issuerOk || Number(info.exp) * 1000 <= Date.now() ||
      info.email_verified !== "true" || !info.email) return fail(request, "identity");

  const email = String(info.email).trim().toLowerCase();
  let user = await env.DB.prepare("SELECT id,name,email,role,active FROM users WHERE email=?").bind(email).first();
  if (user && !user.active) return fail(request, "disabled");
  if (!user) {
    const id = newId();
    const name = String(info.name || info.given_name || email.split("@")[0]).trim().slice(0, 80) || "طالب";
    const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(48)), b => b.toString(16).padStart(2, "0")).join("");
    const { salt, hash } = await hashPassword(randomPassword);
    try {
      await env.DB.prepare("INSERT INTO users (id,name,email,password_hash,password_salt,role) VALUES (?,?,?,?,?,'student')")
        .bind(id, name, email, hash, salt).run();
      user = { id, name, email, role: "student", active: 1 };
    } catch {
      user = await env.DB.prepare("SELECT id,name,email,role,active FROM users WHERE email=?").bind(email).first();
      if (!user || !user.active) return fail(request, "account");
    }
  }

  const session = await createSession(env.DB, user.id);
  const headers = new Headers({ location: new URL("/", request.url).toString(), "set-cookie": session });
  headers.append("set-cookie", "google_oauth_state=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(null, { status: 302, headers });
}