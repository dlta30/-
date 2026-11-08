import { json } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";
import { getDriveAccessToken } from "../../_lib/google-drive.js";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const id = new URL(context.request.url).searchParams.get("id") || "";
  if (!id || id.length > 80) return json({error:"المقطع غير موجود."},400);
  const row = await context.env.DB.prepare("SELECT id,student_id,object_key,content_type,published FROM student_videos WHERE id=?").bind(id).first();
  if (!row) return json({error:"المقطع غير موجود."},404);
  if (auth.user.role !== "admin" && row.student_id !== auth.user.id) {
    const global = await context.env.DB.prepare("SELECT students_can_view_others FROM student_video_settings WHERE id=1").first();
    if (!row.published || !global?.students_can_view_others) return json({error:"هذا المقطع غير متاح لك حالياً."},403);
  }
  try {
    const token = await getDriveAccessToken(context.env,context.env.DB);
    const headers = {authorization:"Bearer "+token};
    const range = context.request.headers.get("Range");
    if (range) headers.Range = range;
    const upstream = await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(row.object_key)+"?alt=media",{headers});
    if (!upstream.ok) return json({error:upstream.status===404?"ملف الفيديو غير موجود في Google Drive.":"تعذر تحميل الفيديو من Google Drive."},upstream.status===404?404:502);
    const responseHeaders = new Headers();
    responseHeaders.set("content-type",row.content_type);
    responseHeaders.set("content-disposition",'inline; filename="student-video"');
    responseHeaders.set("cache-control","private, no-store");
    responseHeaders.set("x-content-type-options","nosniff");
    responseHeaders.set("accept-ranges","bytes");
    for (const name of ["content-length","content-range","accept-ranges","etag"]) {
      const value=upstream.headers.get(name);
      if(value) responseHeaders.set(name,value);
    }
    return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
  } catch(error) {
    return json({error:"تعذر تشغيل الفيديو. قد يحتاج الأستاذ إلى إعادة ربط Google Drive."},503);
  }
}
