import { json, readJson, newId } from "../../_lib/http.js";
import { hashPassword } from "../../_lib/auth.js";

const ADMIN_EMAIL = "auvb2010@outlook.com";
const ADMIN_NAME = "الأستاذ حسين العباس";

function validKey(provided, expected) {
  if (!expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function inspectDatabase(db) {
  const tables = ["users", "sessions", "exams", "questions", "attempts", "learning_units", "lessons", "student_progress"];
  const found = [];
  for (const table of tables) {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first();
    if (row) found.push(table);
  }
  const missing = tables.filter(x => !found.includes(x));
  let admin = null, admins = 0;
  if (found.includes("users")) {
    const row = await db.prepare("SELECT id,name,email,role,active FROM users WHERE email=?").bind(ADMIN_EMAIL).first();
    admin = row || null;
    const count = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
    admins = Number(count?.n || 0);
  }
  return { database: missing.length ? "incomplete" : "ready", missingTables: missing, admin, adminCount: admins };
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SETUP_KEY) return json({ error: "إعداد Cloudflare مفقود: لم يتم العثور على Secret باسم ADMIN_SETUP_KEY في بيئة Pages Production." }, 503);
  if (!env.DB) return json({ error: "ربط قاعدة البيانات مفقود: أضف D1 binding باسم DB إلى مشروع Pages." }, 503);

  const body = await readJson(request);
  const provided = String(body?.setupKey || "");
  if (!validKey(provided, env.ADMIN_SETUP_KEY)) return json({ error: "مفتاح الإعداد غير مطابق. انسخ قيمة ADMIN_SETUP_KEY من نفس مشروع Pages وبيئة Production، ثم احفظها وأعد النشر." }, 403);

  let status;
  try {
    status = await inspectDatabase(env.DB);
  } catch (error) {
    console.error("Admin bootstrap database inspection failed:", error?.stack || error);
    return json({ error: "تعذر قراءة قاعدة D1. تحقق من ربط DB وصلاحيات قاعدة البيانات ثم أعد النشر.", detail: String(error?.message || "") }, 500);
  }

  if (body?.action === "check") return json({ ok: true, ...status });

  if (status.missingTables.length) {
    return json({ error: "قاعدة البيانات غير مكتملة. نفّذ ملف schema.sql كاملاً في D1 Console قبل إعداد المدير.", missingTables: status.missingTables }, 503);
  }

  const password = String(body?.password || "");
  if (password.length < 12 || password.length > 128) {
    return json({ error: "اكتب كلمة مرور جديدة من 12 إلى 128 حرفاً." }, 400);
  }

  const existing = status.admin;
  if (status.adminCount > 0 && !existing) {
    return json({ error: "يوجد مدير آخر مسجل بالفعل. لم نغيّر أي حساب حفاظاً على أمان المنصة." }, 409);
  }

  try {
    const { salt, hash } = await hashPassword(password);
    if (existing) {
      await env.DB.prepare("UPDATE users SET name=?,role='admin',active=1,password_hash=?,password_salt=? WHERE id=?")
        .bind(ADMIN_NAME, hash, salt, existing.id).run();
      await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(existing.id).run();
      return json({ ok: true, message: "تم إصلاح حساب الأستاذ وتحديث كلمة مروره وإلغاء الجلسات القديمة. سجّل الدخول من جديد.", email: ADMIN_EMAIL, role: "admin" });
    }

    await env.DB.prepare("INSERT INTO users (id,name,email,password_hash,password_salt,role,active) VALUES (?,?,?,?,?,'admin',1)")
      .bind(newId(), ADMIN_NAME, ADMIN_EMAIL, hash, salt).run();
    return json({ ok: true, message: "تم إنشاء حساب الأستاذ حسين العباس بنجاح. يمكنك الآن تسجيل الدخول.", email: ADMIN_EMAIL, role: "admin" }, 201);
  } catch (error) {
    console.error("Admin bootstrap update failed:", error?.stack || error);
    return json({ error: "تعذر حفظ حساب المدير في قاعدة البيانات. راجع D1 Console وتأكد من تطبيق schema.sql.", detail: String(error?.message || "") }, 500);
  }
}
