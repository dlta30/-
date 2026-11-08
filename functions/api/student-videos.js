import { json, readJson, newId } from "../_lib/http.js";
import { requireUser, requireAdmin } from "../_lib/auth.js";

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_SECONDS = 300;
const TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const clean = (v, max=120) => String(v ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0,max);

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS student_videos (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL, duration_seconds INTEGER NOT NULL,
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_student_videos_owner ON student_videos(student_id,created_at DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_student_videos_published ON student_videos(published,created_at DESC)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS student_video_settings (id INTEGER PRIMARY KEY CHECK(id=1), students_can_view_others INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  await db.prepare("INSERT OR IGNORE INTO student_video_settings (id,students_can_view_others) VALUES (1,0)").run();
}

async function setting(db) {
  return await db.prepare("SELECT students_can_view_others FROM student_video_settings WHERE id=1").first();
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const bucket = context.env.STUDENT_VIDEOS;
  if (!bucket) return json({error:"تخزين الفيديوهات غير مربوط بعد. يحتاج المشروع إلى R2 binding باسم STUDENT_VIDEOS."},503);
  const db = context.env.DB;
  await ensureTables(db);
  const global = await setting(db);
  const admin = auth.user.role === "admin";
  const rows = admin
    ? await db.prepare("SELECT v.*,u.name AS student_name FROM student_videos v JOIN users u ON u.id=v.student_id ORDER BY v.created_at DESC").all()
    : await db.prepare("SELECT v.*,u.name AS student_name FROM student_videos v JOIN users u ON u.id=v.student_id WHERE v.student_id=? OR (?=1 AND v.published=1) ORDER BY v.created_at DESC").bind(auth.user.id, Number(global?.students_can_view_others||0)).all();
  return json({videos:(rows.results||[]).map(v=>({id:v.id,title:v.title,studentId:v.student_id,studentName:v.student_name,contentType:v.content_type,sizeBytes:v.size_bytes,durationSeconds:v.duration_seconds,published:!!v.published,createdAt:v.created_at,isMine:v.student_id===auth.user.id})),studentsCanViewOthers:!!global?.students_can_view_others,isAdmin:admin});
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (auth.user.role !== "student") return json({error:"رفع المقاطع متاح لحساب الطالب فقط."},403);
  const bucket = context.env.STUDENT_VIDEOS;
  if (!bucket) return json({error:"تخزين الفيديوهات غير مربوط بعد. يحتاج المشروع إلى R2 binding باسم STUDENT_VIDEOS."},503);
  const request = context.request;
  let titleHeader = request.headers.get("x-video-title") || "";
  try { titleHeader = decodeURIComponent(titleHeader); } catch {}\n  const title = clean(titleHeader,120);
  const contentType = (request.headers.get("content-type")||"").split(";")[0].toLowerCase();
  const size = Number(request.headers.get("content-length")||0);
  const duration = Number(request.headers.get("x-video-duration"));
  if (title.length < 2) return json({error:"اكتب عنوان المقطع (حرفان على الأقل)."},400);
  if (!TYPES.has(contentType)) return json({error:"صيغة الفيديو غير مدعومة. استخدم MP4 أو WebM أو MOV."},415);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) return json({error:"حجم المقطع يجب ألا يتجاوز 100 ميجابايت."},413);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) return json({error:"مدة المقطع يجب ألا تتجاوز 5 دقائق."},400);
  if (!request.body) return json({error:"لم يتم استلام ملف الفيديو."},400);
  const id = newId(), key = "student-videos/"+id;
  try {
    await bucket.put(key, request.body, {httpMetadata:{contentType},customMetadata:{studentId:auth.user.id,title,durationSeconds:String(Math.round(duration))}});
    await context.env.DB.prepare("INSERT INTO student_videos (id,student_id,title,object_key,content_type,size_bytes,duration_seconds,published) VALUES (?,?,?,?,?,?,?,0)")
      .bind(id,auth.user.id,title,key,contentType,size,Math.round(duration)).run();
  } catch (error) {
    try { await bucket.delete(key); } catch {}
    return json({error:"تعذر حفظ المقطع. حاول مرة أخرى.",detail:String(error?.message||"")},500);
  }
  return json({ok:true,id,message:"تم رفع المقطع بنجاح. لا يمكن للطالب حذفه، وسيظهر للأستاذ للمراجعة."},201);
}
