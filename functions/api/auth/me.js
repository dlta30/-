import { json } from "../../_lib/http.js";
import { currentUser } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const user = await currentUser(env.DB, request);
  return json({ user: user ? { id:user.id, name:user.name, email:user.email, role:user.role } : null });
}
