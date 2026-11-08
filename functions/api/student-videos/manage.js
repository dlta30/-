import { json, readJson } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";

export async function onRequestPatch(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const body = await readJson(context.request);
  const db = context.env.DB;
  await db.prepare("CREATE TABLE IF NOT EXISTS student_video_settings (id INTEGER PRIMARY KEY CHECK(id=1), students_can_view_others INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  await db.prepare("INSERT OR IGNORE INTO student_video_settings (id,students_can_view_others) VALUES (1,0)").run();
  if (body?.action === "global") {
    const enabled = body.enabled === true ? 1 : 0;
    await db.prepare("UPDATE student_video_settings SET students_can_view_others=?,updated_at=datetime('now') WHERE id=1").bind(enabled).run();
    return json({ok:true,studentsCanViewOthers:!!enabled});
  }
  const id = String(body?.id||"").trim();
  if (!id || typeof body?.published !== "boolean") return json({error:"بيانات النشر غير مكتملة."},400);
  const result = await db.prepare("UPDATE student_videos SET published=? WHERE id=?").bind(body.published?1:0,id).run();
  if (!result.meta?.changes) return json({error:"المقطع غير موجود."},404);
  return json({ok:true,published:body.published});
}
