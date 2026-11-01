import { json } from "../_lib/http.js";
export async function onRequestGet({ env }) {
  try {
    await env.DB.prepare("SELECT 1").first();
    return json({ ok: true, service: "Hussein Abbas Chemistry", database: "connected" });
  } catch {
    return json({ ok: false, error: "Database binding is not configured" }, 503);
  }
}
