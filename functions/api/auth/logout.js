import { json } from "../../_lib/http.js";
import { clearSession } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  const cookie = await clearSession(env.DB, request);
  return json({ ok: true }, 200, { "set-cookie": cookie });
}
