import { json } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const bucket = context.env.STUDENT_VIDEOS;
  if (!bucket) return json({error:"تخزين الفيديوهات غير مربوط."},503);
  const id = new URL(context.request.url).searchParams.get("id") || "";
  if (!id || id.length > 80) return json({error:"المقطع غير موجود."},400);
  const row = await context.env.DB.prepare("SELECT id,student_id,object_key,content_type,title,published FROM student_videos WHERE id=?").bind(id).first();
  if (!row) return json({error:"المقطع غير موجود."},404);
  if (auth.user.role !== "admin" && row.student_id !== auth.user.id) {
    const global = await context.env.DB.prepare("SELECT students_can_view_others FROM student_video_settings WHERE id=1").first();
    if (!row.published || !global?.students_can_view_others) return json({error:"هذا المقطع غير متاح لك حالياً."},403);
  }
  const object = await bucket.get(row.object_key);
  if (!object) return json({error:"ملف الفيديو غير موجود في التخزين."},404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type",row.content_type);
  headers.set("content-disposition","inline; filename=\"student-video\"");
  headers.set("cache-control","private, no-store");
  headers.set("x-content-type-options","nosniff");
  if (object.httpEtag) headers.set("etag",object.httpEtag);
  return new Response(object.body,{headers});
}
