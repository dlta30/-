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

async function tableColumns(db, table) {
  const result = await db.prepare(`PRAGMA table_info("${table}")`).all();
  return (result.results || []).map(column => column.name);
}

async function ensureSemesterColumns(db) {
  const migrations = [
    ["exams", "semester", "ALTER TABLE exams ADD COLUMN semester TEXT NOT NULL DEFAULT '1'"],
    ["learning_units", "semester", "ALTER TABLE learning_units ADD COLUMN semester TEXT NOT NULL DEFAULT '1'"]
  ];
  const applied = [];
  for (const [table, column, sql] of migrations) {
    const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first();
    if (!exists) continue;
    const columns = await tableColumns(db, table);
    if (!columns.includes(column)) {
      await db.prepare(sql).run();
      applied.push(table + "." + column);
    }
  }
  return applied;
}

async function inspectDatabase(db) {
  const required = {
    users: ["id", "name", "email", "password_hash", "password_salt", "role", "active"],
    sessions: ["id", "user_id", "token_hash", "expires_at"],
    exams: ["id", "title", "created_by", "semester"],
    questions: ["id", "exam_id", "prompt", "options_json", "correct_index"],
    attempts: ["id", "exam_id", "student_id", "score", "total_points", "answers_json"],
    learning_units: ["id", "title", "created_by", "semester"],
    lessons: ["id", "unit_id", "title", "content", "created_by"],
    student_progress: ["id", "student_id", "lesson_id"]
  };
  const missingTables = [];
  const missingColumns = [];
  for (const [table, columns] of Object.entries(required)) {
    const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first();
    if (!exists) { missingTables.push(table); continue; }
    const actual = await tableColumns(db, table);
    for (const column of columns) if (!actual.includes(column)) missingColumns.push(table + "." + column);
  }

  let admin = null, adminCount = 0;
  if (!missingTables.includes("users") && !required.users.some(c => missingColumns.includes("users." + c))) {
    admin = await db.prepare("SELECT id,name,email,role,active FROM users WHERE email=?").bind(ADMIN_EMAIL).first() || null;
    const count = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
    adminCount = Number(count?.n || 0);
  }
  return {
    database: missingTables.length || missingColumns.length ? "incomplete" : "ready",
    missingTables, missingColumns, admin, adminCount
  };
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SETUP_KEY) return json({ error: "إعداد Cloudflare مفقود: لم يتم العثور على Secret باسم ADMIN_SETUP_KEY في بيئة Pages Production." }, 503);
  if (!env.DB) return json({ error: "ربط قاعدة البيانات مفقود: أضف D1 binding باسم DB إلى مشروع Pages." }, 503);

  const body = await readJson(request);
  const provided = String(body?.setupKey || "");
  if (!validKey(provided, env.ADMIN_SETUP_KEY)) return json({ error: "مفتاح الإعداد غير مطابق. انسخ قيمة ADMIN_SETUP_KEY من نفس مشروع Pages وبيئة Production، ثم احفظها وأعد النشر." }, 403);

  let status, autoMigrations = [];
  try {
    autoMigrations = await ensureSemesterColumns(env.DB);
    status = await inspectDatabase(env.DB);
  } catch (error) {
    console.error("Admin bootstrap database inspection/migration failed:", error?.stack || error);
    return json({
      error: "تعذر فحص أو تحديث أعمدة قاعدة D1 تلقائياً.",
      detail: String(error?.message || error),
      hint: "تأكد من ربط DB بقاعدة D1 الصحيحة وأن الجداول الأساسية موجودة."
    }, 500);
  }

  if (body?.action === "check") return json({ ok: true, ...status, autoMigrations });

  if (status.missingTables.length || status.missingColumns.length) {
    return json({
      error: "بنية قاعدة البيانات غير مكتملة. راجع العناصر الناقصة أدناه قبل إعداد المدير.",
      missingTables: status.missingTables,
      missingColumns: status.missingColumns
    }, 503);
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
    return json({
      error: "تعذر حفظ حساب المدير في قاعدة البيانات.",
      detail: String(error?.message || error),
      hint: "افتح D1 Console وتأكد أن قاعدة البيانات المرتبطة بالمشروع هي نفسها التي نفذت عليها schema.sql."
    }, 500);
  }
}
