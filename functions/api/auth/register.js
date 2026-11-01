import { json, readJson, newId } from "../../_lib/http.js";
import { hashPassword, createSession } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (name.length < 2 || name.length > 80) return json({ error: "اكتب اسماً صحيحاً من حرفين إلى 80 حرفاً" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return json({ error: "البريد الإلكتروني غير صحيح" }, 400);
  if (password.length < 8 || password.length > 128) return json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (existing) return json({ error: "هذا البريد مسجل مسبقاً" }, 409);
  const { salt, hash } = await hashPassword(password);
  const id = newId();
  try {
    await env.DB.prepare("INSERT INTO users (id,name,email,password_hash,password_salt,role) VALUES (?,?,?,?,?,'student')")
      .bind(id, name, email, hash, salt).run();
  } catch {
    return json({ error: "تعذر إنشاء الحساب، ربما البريد مستخدم" }, 409);
  }
  const cookie = await createSession(env.DB, id);
  return json({ user: { id, name, email, role: "student" } }, 201, { "set-cookie": cookie });
}
