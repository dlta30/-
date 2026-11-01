import { json } from "./http.js";

const enc = new TextEncoder();
const COOKIE = "chem_session";
const SESSION_DAYS = 7;

function toBase64(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}
function fromBase64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return { salt: toBase64(salt), hash: toBase64(bits) };
}
export async function verifyPassword(password, saltText, hashText) {
  const result = await hashPassword(password, fromBase64(saltText));
  const a = enc.encode(result.hash), b = enc.encode(hashText);
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function digest(value) {
  return toBase64(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}
function cookieValue(request) {
  const raw = request.headers.get("Cookie") || "";
  const item = raw.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : "";
}
export async function createSession(db, userId) {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
  const tokenHash = await digest(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(), userId, tokenHash, expires).run();
  return COOKIE + "=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + (SESSION_DAYS * 86400);
}
export async function clearSession(db, request) {
  const token = cookieValue(request);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await digest(token)).run();
  return COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
export async function currentUser(db, request) {
  const token = cookieValue(request);
  if (!token) return null;
  return await db.prepare(`SELECT u.id,u.name,u.email,u.role,u.active
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') AND u.active=1`)
    .bind(await digest(token)).first();
}
export async function requireUser(context) {
  const user = await currentUser(context.env.DB, context.request);
  if (!user) return { response: json({ error: "يلزم تسجيل الدخول أولاً" }, 401) };
  return { user };
}
export async function requireAdmin(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth;
  if (auth.user.role !== "admin") return { response: json({ error: "هذه الصلاحية للمدير فقط" }, 403) };
  return auth;
}
