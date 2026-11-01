import { json, readJson, newId } from "../../_lib/http.js";
import { hashPassword } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SETUP_KEY) return json({ error: "اضبط ADMIN_SETUP_KEY في إعدادات Cloudflare أولاً" }, 503);
  const body = await readJson(request);
  const provided = String(body?.setupKey || "");
  if (provided.length !== env.ADMIN_SETUP_KEY.length) return json({ error: "مفتاح الإعداد غير صحيح" }, 403);
  let diff = 0; for (let i=0;i<provided.length;i++) diff |= provided.charCodeAt(i) ^ env.ADMIN_SETUP_KEY.charCodeAt(i);
  if (diff) return json({ error: "مفتاح الإعداد غير صحيح" }, 403);
  const email = "auvb2010@outlook.com";
  const name = "الأستاذ حسين العباس";
  const [count, existing] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first(),
    env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first()
  ]);
  if (Number(count?.n || 0) > 0 && !existing) return json({ error: "يوجد حساب مدير مُعد مسبقاً، ولا يمكن إنشاء مدير ثانٍ" }, 409);
  const password = String(body?.password || "");
  if (existing) {
    if (password && (password.length < 8 || password.length > 128))
      return json({ error: "كلمة المرور يجب أن تكون من 8 إلى 128 حرفاً" }, 400);
    if (password) {
      const { salt, hash } = await hashPassword(password);
      await env.DB.prepare("UPDATE users SET name=?,role='admin',active=1,password_hash=?,password_salt=? WHERE id=?")
        .bind(name, hash, salt, existing.id).run();
    } else {
      await env.DB.prepare("UPDATE users SET name=?,role='admin',active=1 WHERE id=?")
        .bind(name, existing.id).run();
    }
    return json({ ok: true, message: "تم ترقية حساب الأستاذ الموجود إلى مدير. كلمة المرور الحالية لم تتغير." }, 200);
  }
  if (password.length < 8 || password.length > 128)
    return json({ error: "لإنشاء حساب جديد، كلمة مرور المدير يجب أن تكون 8 أحرف على الأقل" }, 400);
  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users (id,name,email,password_hash,password_salt,role) VALUES (?,?,?,?,?,'admin')")
    .bind(newId(), name, email, hash, salt).run();
  return json({ ok: true, message: "تم إنشاء حساب المدير. سجّل الدخول من صفحة المنصة." }, 201);
}
