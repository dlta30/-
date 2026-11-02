import { json, readJson } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";

async function ensureClassColumn(db) {
  const columns = await db.prepare("PRAGMA table_info(users)").all();
  if (!(columns.results || []).some(c => c.name === "class_name")) {
    await db.prepare("ALTER TABLE users ADD COLUMN class_name TEXT").run();
  }
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (auth.user.role !== "student") return json({error:"هذه الخاصية مخصصة للطلاب"},403);
  try {
    await ensureClassColumn(context.env.DB);
    const row = await context.env.DB.prepare("SELECT class_name FROM users WHERE id=?").bind(auth.user.id).first();
    return json({class_name: row?.class_name || ""});
  } catch (error) {
    console.error("Student profile read failed", error);
    return json({error:"تعذر تحميل الفصل الدراسي. حدّث الصفحة وحاول مجدداً."},500);
  }
}

export async function onRequestPatch(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (auth.user.role !== "student") return json({error:"هذه الخاصية مخصصة للطلاب"},403);
  const body = await readJson(context.request);
  const className = String(body?.className || "").trim();
  if (!/^2\/[2-5]$/.test(className)) return json({error:"اختر فصلاً من القائمة"},400);
  try {
    await ensureClassColumn(context.env.DB);
    const result = await context.env.DB.prepare("UPDATE users SET class_name=? WHERE id=? AND role='student'").bind(className,auth.user.id).run();
    if (!result.meta?.changes) return json({error:"لم يتم العثور على حساب الطالب لتحديث فصله."},404);
    return json({ok:true,class_name:"ثاني ثانوي - "+className});
  } catch (error) {
    console.error("Student profile update failed", error);
    return json({error:"تعذر حفظ الفصل في قاعدة البيانات. حاول مرة أخرى بعد تحديث الصفحة."},500);
  }
}
