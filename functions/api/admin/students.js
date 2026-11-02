import { json, readJson } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";

async function ensureClassColumn(db) {
  const columns = await db.prepare("PRAGMA table_info(users)").all();
  if (!(columns.results || []).some(column => column.name === "class_name")) {
    try {
      await db.prepare("ALTER TABLE users ADD COLUMN class_name TEXT").run();
    } catch (error) {
      // A student profile request may have added the column at the same time.
      const refreshed = await db.prepare("PRAGMA table_info(users)").all();
      if (!(refreshed.results || []).some(column => column.name === "class_name")) throw error;
    }
  }
}

export async function onRequestGet(context) {
  const auth=await requireAdmin(context);if(auth.response)return auth.response;
  // Keep existing D1 databases compatible, even if no student has opened their profile yet.
  await ensureClassColumn(context.env.DB);
  const rows=await context.env.DB.prepare(`
    SELECT u.id,u.name,u.email,u.active,u.created_at,u.class_name,
      COUNT(a.id) AS attempts,
      COALESCE(SUM(a.score),0) AS earned_points,
      COALESCE(SUM(a.total_points),0) AS total_points
    FROM users u LEFT JOIN attempts a ON a.student_id=u.id
    WHERE u.role='student' GROUP BY u.id ORDER BY u.created_at DESC
  `).all();
  return json({students:rows.results||[]});
}

export async function onRequestPatch(context) {
  const auth=await requireAdmin(context);if(auth.response)return auth.response;
  const body=await readJson(context.request);
  const id=String(body?.id||"").trim();
  if(!id || typeof body?.active!=="boolean") return json({error:"بيانات تحديث حساب الطالب غير مكتملة"},400);
  const student=await context.env.DB.prepare("SELECT id FROM users WHERE id=? AND role='student'").bind(id).first();
  if(!student) return json({error:"حساب الطالب غير موجود"},404);
  await context.env.DB.prepare("UPDATE users SET active=? WHERE id=? AND role='student'").bind(body.active?1:0,id).run();
  if(!body.active) await context.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  return json({ok:true,active:body.active,message:body.active?"تم تفعيل حساب الطالب":"تم إيقاف الحساب وإلغاء جلساته"});
}
