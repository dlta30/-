import { json } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const bucket = context.env.STUDENT_VIDEOS;
  if (!bucket) return json({error:"تخزين الفيديوهات غير مربوط."},503);
  const id = new URL(context.request.url).searchParams.get("id") || "";
  if (!id || id.length > 80) return json({error:"المقطع غير موجود."},400);
  const row = await context.env.DB.prepare("SELECT id,student_id,object_key,content_type,published FROM student_videos WHERE id=?").bind(id).first();
  if (!row) return json({error:"المقطع غير موجود."},404);
  if (auth.user.role !== "admin" && row.student_id !== auth.user.id) {
    const global = await context.env.DB.prepare("SELECT students_can_view_others FROM student_video_settings WHERE id=1").first();
    if (!row.published || !global?.students_can_view_others) return json({error:"هذا المقطع غير متاح لك حالياً."},403);
  }
  const rangeHeader = context.request.headers.get("Range");
  let options;
  let status = 200;
  let start = 0;
  let end = null;
  let object = await bucket.get(row.object_key);
  if (!object) return json({error:"ملف الفيديو غير موجود في التخزين."},404);
  const total = object.size;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || (!match[1] && !match[2])) return new Response(null,{status:416,headers:{"content-range":`bytes */${total}`}});
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) return new Response(null,{status:416,headers:{"content-range":`bytes */${total}`}});
      start = Math.max(0,total-suffix);
      end = total-1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : total-1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= total) return new Response(null,{status:416,headers:{"content-range":`bytes */${total}`}});
    end = Math.min(end,total-1);
    options = {range:{offset:start,length:end-start+1}};
    object = await bucket.get(row.object_key,options);
    if (!object) return json({error:"تعذر قراءة جزء الفيديو."},404);
    status = 206;
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type",row.content_type);
  headers.set("content-disposition","inline; filename=\"student-video\"");
  headers.set("cache-control","private, no-store");
  headers.set("x-content-type-options","nosniff");
  headers.set("accept-ranges","bytes");
  headers.set("content-length",String(status===206?end-start+1:total));
  if (status===206) headers.set("content-range",`bytes ${start}-${end}/${total}`);
  if (object.httpEtag) headers.set("etag",object.httpEtag);
  return new Response(object.body,{status,headers});
}
