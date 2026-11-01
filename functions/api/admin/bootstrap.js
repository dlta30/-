import { json, readJson, newId } from "../../_lib/http.js";
import { hashPassword } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SETUP_KEY) return json({ error: "اضبط ADMIN_SETUP_KEY في إعدادات Cloudflare أولاً" }, 503);
  const body = await readJson(request);
  const provided = String(body?.setupKey || "");
  if (provided.length !== env.ADMIN_SETUP_KEY.length) return json({ error: "مفتاح الإعداد غير صحيح" }, 403);
  let diff = 0; for (let i=0;i<provided.length;i++) diff |= provided.charCodeAt(i) ^ env.ADMIN_SETUP_KEY.charCodeAt(i);
  if (diff) return json({ error: "مفتاح الإعداد غير صحيح" }, 403);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
  if (Number(count?.n || 0) > 0) return json({ error: "تم إعداد حساب المدير مسبقاً" }, 409);
  const email = "auvb2010@outlook.com";
  const name = "الأستاذ حسين عباس";
  const password = String(body?.password || "");
  if (password.length < 12 || password.length > 128) return json({ error: "كلمة مرور المدير يجب أن تكون 12 حرفاً على الأقل" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (existing) return json({ error: "البريد موجود كحساب طالب. تواصل مع الدعم لترقيته بأمان." }, 409);
  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users (id,name,email,password_hash,password_salt,role) VALUES (?,?,?,?,?,'admin')")
    .bind(newId(), name, email, hash, salt).run();
  return json({ ok: true, message: "تم إنشاء حساب المدير. سجّل الدخول من صفحة المنصة." }, 201);
}
