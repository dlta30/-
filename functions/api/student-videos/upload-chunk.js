import { json } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const auth=await requireUser(context);
  if(auth.response) return auth.response;
  if(auth.user.role!=="student") return json({error:"غير مصرح."},403);
  const db=context.env.DB;
  const uploadId=context.request.headers.get("x-upload-id")||"";
  const start=Number(context.request.headers.get("x-chunk-start"));
  const end=Number(context.request.headers.get("x-chunk-end"));
  const total=Number(context.request.headers.get("x-upload-total"));
  if(!uploadId||uploadId.length>80||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||!Number.isSafeInteger(total)||start<0||end<start||end>=total||end-start+1>8*1024*1024) return json({error:"بيانات جزء الرفع غير صحيحة."},400);
  const row=await db.prepare("SELECT * FROM student_video_uploads WHERE id=? AND student_id=?").bind(uploadId,auth.user.id).first();
  if(!row) return json({error:"جلسة الرفع غير موجودة أو انتهت."},404);
  if(total!==Number(row.size_bytes)) return json({error:"حجم الملف لا يطابق جلسة الرفع."},400);
  const chunk=await context.request.arrayBuffer();
  if(chunk.byteLength!==end-start+1) return json({error:"الجزء المرسل غير مكتمل."},400);
  try {
    const upstream=await fetch(row.upload_url,{method:"PUT",headers:{"content-type":row.content_type,"content-range":"bytes "+start+"-"+end+"/"+total},body:chunk,redirect:"manual"});
    if(upstream.status===308) {
      const range=upstream.headers.get("range")||"";
      const match=range.match(/-(\d+)$/);
      const nextOffset=match?Number(match[1])+1:0;
      return json({ok:true,done:false,nextOffset});
    }
    if(upstream.status===200||upstream.status===201) {
      const file=await upstream.json();
      if(!file.id) throw new Error("Google Drive لم يُرجع معرّف الملف.");
      await db.prepare("CREATE TABLE IF NOT EXISTS student_videos (id TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,content_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,duration_seconds INTEGER NOT NULL,published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
      await db.prepare("ALTER TABLE student_videos ADD COLUMN drive_slot INTEGER NOT NULL DEFAULT 1").run().catch(()=>{});
      await db.prepare("INSERT INTO student_videos (id,student_id,title,object_key,content_type,size_bytes,duration_seconds,published,drive_slot) VALUES (?,?,?,?,?,?,?,0,?)")
        .bind(row.id,row.student_id,row.title,file.id,row.content_type,row.size_bytes,row.duration_seconds,row.drive_slot).run();
      await db.prepare("DELETE FROM student_video_uploads WHERE id=?").bind(uploadId).run();
      return json({ok:true,done:true,message:"تم رفع المقطع وحفظه بنجاح."});
    }
    const detail=await upstream.text().catch(()=>"");
    return json({error:"تعذر رفع جزء الفيديو إلى Google Drive ("+upstream.status+").",detail:detail.slice(0,300)},502);
  } catch(error) {
    return json({error:"انقطع رفع الفيديو. أعد المحاولة؛ إذا اكتمل جزء سابق فسيُحدّث النظام موضع الرفع.",detail:String(error?.message||"")},502);
  }
}