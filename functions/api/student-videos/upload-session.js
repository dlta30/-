import { json, newId } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";
import { getDriveAccessToken, ensureDriveTable } from "../../_lib/google-drive.js";

const MAX_BYTES = 500 * 1024 * 1024;
const MAX_SECONDS = 300;
const TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const clean = v => String(v ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0,120);

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS student_videos (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL, duration_seconds INTEGER NOT NULL,
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await db.prepare("ALTER TABLE student_videos ADD COLUMN drive_slot INTEGER NOT NULL DEFAULT 1").run().catch(()=>{});
  await db.prepare(`CREATE TABLE IF NOT EXISTS student_video_uploads (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, title TEXT NOT NULL,
    content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, duration_seconds INTEGER NOT NULL,
    drive_slot INTEGER NOT NULL, upload_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (auth.user.role !== "student") return json({error:"رفع المقاطع متاح لحساب الطالب فقط."},403);
  const body = await context.request.json().catch(()=>null);
  const title = clean(body?.title);
  const contentType = String(body?.contentType||"").toLowerCase();
  const size = Number(body?.size);
  const duration = Number(body?.duration);
  if (title.length < 2) return json({error:"اكتب عنوان المقطع (حرفان على الأقل)."},400);
  if (!TYPES.has(contentType)) return json({error:"صيغة الفيديو غير مدعومة. استخدم MP4 أو WebM أو MOV."},415);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) return json({error:"حجم المقطع يجب ألا يتجاوز 500 ميجابايت."},413);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) return json({error:"مدة المقطع يجب ألا تتجاوز 5 دقائق."},400);
  const db=context.env.DB;
  await ensureTables(db);
  await ensureDriveTable(db);
  const first=await db.prepare("SELECT 1 AS ok FROM google_drive_config WHERE id=1").first();
  const second=await db.prepare("SELECT 1 AS ok FROM google_drive_account_two WHERE id=1").first();
  const available=[];
  if(first) available.push(1);
  if(second) available.push(2);
  if(!available.length) return json({error:"الأستاذ لم يربط Google Drive بعد."},503);
  const counts=await db.prepare("SELECT drive_slot,COALESCE(SUM(size_bytes),0) AS total FROM student_videos GROUP BY drive_slot").all();
  const totals=new Map((counts.results||[]).map(r=>[Number(r.drive_slot),Number(r.total)]));
  const slot=available.sort((a,b)=>(totals.get(a)||0)-(totals.get(b)||0))[0];
  try {
    const token=await getDriveAccessToken(context.env,db,slot);
    const table=slot===2?"google_drive_account_two":"google_drive_config";
    const account=await db.prepare("SELECT folder_id FROM "+table+" WHERE id=1").first();
    const metadata={name:title+" - "+newId(),mimeType:contentType};
    if(account?.folder_id) metadata.parents=[account.folder_id];
    const init=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size",{
      method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json","x-upload-content-type":contentType,"x-upload-content-length":String(size)},body:JSON.stringify(metadata)
    });
    if(!init.ok) throw new Error("Google Drive رفض بدء جلسة الرفع ("+init.status+").");
    const uploadUrl=init.headers.get("location");
    if(!uploadUrl) throw new Error("لم يُرجع Google Drive رابط الرفع.");
    const id=newId();
    await db.prepare("INSERT INTO student_video_uploads (id,student_id,title,content_type,size_bytes,duration_seconds,drive_slot,upload_url) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id,auth.user.id,title,contentType,size,Math.round(duration),slot,uploadUrl).run();
    return json({ok:true,uploadId:id,chunkSize:8*1024*1024},201);
  } catch(error) {
    return json({error:"تعذر تجهيز التخزين. تأكد من ربط حساب Google Drive.",detail:String(error?.message||"")},500);
  }
}