import { json, readJson, newId } from "../_lib/http.js";
import { requireUser, requireAdmin } from "../_lib/auth.js";

const TYPES = new Set(["unit", "lesson", "lesson-video", "experiment", "resource", "announcement"]);
const clean = (v, max = 5000) => String(v ?? "").trim().slice(0, max);

async function ensureLessonColumn(db, name, sql) {
  const columns = await db.prepare("PRAGMA table_info(lessons)").all();
  if ((columns.results || []).some(x => x.name === name)) return;
  try {
    await db.prepare(sql).run();
  } catch (error) {
    const refreshed = await db.prepare("PRAGMA table_info(lessons)").all();
    if (!(refreshed.results || []).some(x => x.name === name)) throw error;
  }
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  // Add video support safely for existing databases.
  await ensureLessonColumn(db, "video_url", "ALTER TABLE lessons ADD COLUMN video_url TEXT NOT NULL DEFAULT ''");
  await ensureLessonColumn(db, "video_duration_seconds", "ALTER TABLE lessons ADD COLUMN video_duration_seconds INTEGER NOT NULL DEFAULT 0");
  await db.prepare("CREATE TABLE IF NOT EXISTS lesson_video_progress (student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, watched_seconds REAL NOT NULL DEFAULT 0, duration_seconds REAL NOT NULL DEFAULT 0, last_position REAL NOT NULL DEFAULT 0, last_heartbeat_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(student_id,lesson_id))").run();
  const admin = auth.user.role === "admin";
  const published = admin ? "" : " WHERE published=1";
  const [units, lessons, experiments, resources, announcements] = await Promise.all([
    db.prepare("SELECT * FROM learning_units" + published + " ORDER BY semester,sort_order,title").all(),
    db.prepare("SELECT * FROM lessons" + published + " ORDER BY sort_order,title").all(),
    db.prepare("SELECT * FROM experiments" + published + " ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM resources" + published + " ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM announcements" + published + " ORDER BY created_at DESC LIMIT 50").all()
  ]);
  const progress = admin ? { results: [] } : await db.prepare(
    "SELECT lesson_id,completed_at FROM student_progress WHERE student_id=?"
  ).bind(auth.user.id).all();
  const videoProgress = admin ? { results: [] } : await db.prepare(
    "SELECT lesson_id,watched_seconds,duration_seconds FROM lesson_video_progress WHERE student_id=?"
  ).bind(auth.user.id).all();
  return json({
    units: units.results || [], lessons: lessons.results || [],
    experiments: (experiments.results || []).map(x => ({...x, materials: JSON.parse(x.materials_json || "[]"), steps: JSON.parse(x.steps_json || "[]")})),
    resources: resources.results || [], announcements: announcements.results || [],
    completedLessons: (progress.results || []).map(x => x.lesson_id),
    videoProgress: (videoProgress.results || []).map(x => ({lessonId:x.lesson_id,watchedSeconds:Math.floor(x.watched_seconds||0),durationSeconds:Math.floor(x.duration_seconds||0),percent:x.duration_seconds?Math.min(100,Math.floor(x.watched_seconds/x.duration_seconds*100)):0}))
  });
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const body = await readJson(context.request);
  const type = clean(body?.type, 30);
  const db = context.env.DB;
  if (type === "video-heartbeat") {
    if (auth.user.role !== "student") return json({error:"هذا الإجراء مخصص للطلاب"},403);
    const lessonId = clean(body.lessonId, 80), position = Number(body.position), duration = Number(body.duration);
    if (!lessonId || !Number.isFinite(position) || !Number.isFinite(duration) || duration < 1 || duration > 86400 || position < 0) return json({error:"بيانات مشاهدة الفيديو غير صالحة"},400);
    const lesson = await db.prepare("SELECT id,video_duration_seconds FROM lessons WHERE id=? AND published=1 AND video_url<>''").bind(lessonId).first();
    if (!lesson) return json({error:"فيديو الدرس غير متاح"},404);
    const trustedDuration = Number(lesson.video_duration_seconds || 0);
    if (trustedDuration < 1 || Math.abs(duration-trustedDuration) > 2) return json({error:"مدة الفيديو لا تطابق المدة التي حددها الأستاذ."},400);
    if (position > trustedDuration + 2) return json({error:"موضع المشاهدة غير صالح"},400);
    const now = Math.floor(Date.now()/1000);
    const previous = await db.prepare("SELECT watched_seconds,duration_seconds,last_position,last_heartbeat_at FROM lesson_video_progress WHERE student_id=? AND lesson_id=?").bind(auth.user.id,lessonId).first();
    let watched = Number(previous?.watched_seconds || 0);
    if (previous && Number(previous.duration_seconds) > 0 && Math.abs(Number(previous.duration_seconds)-trustedDuration) > 2) watched = 0;
    if (previous && Number(previous.last_heartbeat_at) > 0) {
      const elapsed = now - Number(previous.last_heartbeat_at), delta = position - Number(previous.last_position || 0);
      if (elapsed >= 3 && elapsed <= 30 && delta > 0 && delta <= elapsed * 2 + 3) watched += Math.min(elapsed, delta);
    }
    watched = Math.min(watched, trustedDuration);
    await db.prepare("INSERT INTO lesson_video_progress (student_id,lesson_id,watched_seconds,duration_seconds,last_position,last_heartbeat_at) VALUES (?,?,?,?,?,?) ON CONFLICT(student_id,lesson_id) DO UPDATE SET watched_seconds=excluded.watched_seconds,duration_seconds=excluded.duration_seconds,last_position=excluded.last_position,last_heartbeat_at=excluded.last_heartbeat_at")
      .bind(auth.user.id,lessonId,watched,trustedDuration,position,now).run();
    return json({ok:true,watchedSeconds:Math.floor(watched),requiredSeconds:Math.ceil(trustedDuration*0.9),percent:Math.min(100,Math.floor(watched/trustedDuration*100)),canComplete:watched>=trustedDuration*0.9});
  }
  if (type === "progress") {
    if (auth.user.role !== "student") return json({error:"هذا الإجراء مخصص للطلاب"},403);
    const lessonId = clean(body.lessonId, 80), lesson = await db.prepare("SELECT id,video_url FROM lessons WHERE id=? AND published=1").bind(lessonId).first();
    if (!lesson) return json({error:"الدرس غير متاح"},404);
    if (!String(lesson.video_url || "").trim()) return json({error:"هذا الدرس يحتاج إلى فيديو من الأستاذ قبل تسجيل إكماله."},400);
    const watch = await db.prepare("SELECT watched_seconds,duration_seconds FROM lesson_video_progress WHERE student_id=? AND lesson_id=?").bind(auth.user.id,lessonId).first();
    if (!watch || Number(watch.duration_seconds) < 1 || Number(watch.watched_seconds) < Number(watch.duration_seconds)*0.9) return json({error:"لا يمكنك إكمال الدرس قبل مشاهدة 90٪ على الأقل من الفيديو."},400);
    await db.prepare("INSERT OR IGNORE INTO student_progress (id,student_id,lesson_id) VALUES (?,?,?)").bind(newId(),auth.user.id,lessonId).run();
    return json({ok:true});
  }
  const admin = await requireAdmin(context);
  if (admin.response) return admin.response;
  if (!TYPES.has(type)) return json({error:"نوع المحتوى غير معروف"},400);
  const id = newId();
  const published = body.publish === true ? 1 : 0;
  try {
    if (type === "unit") {
      const title = clean(body.title,160);
      if (title.length < 3) return json({error:"اكتب عنوان الوحدة"},400);
      await db.prepare("INSERT INTO learning_units (id,title,description,sort_order,published,created_by,semester) VALUES (?,?,?,?,?,?,?)")
        .bind(id,title,clean(body.description,1000),Number(body.sortOrder)||0,published,admin.user.id,body.semester==="2"?"2":"1").run();
    } else if (type === "lesson") {
      const title = clean(body.title,160), content = clean(body.content,20000), videoUrl = clean(body.videoUrl,1500), videoDuration = Number(body.videoDurationSeconds);
      if (title.length < 3 || content.length < 10) return json({error:"عنوان الدرس ومحتواه مطلوبان"},400);
      if (!/^https:\/\//i.test(videoUrl)) return json({error:"أضف رابط فيديو مباشر وآمن (HTTPS) للدرس قبل نشره."},400);
      if (!Number.isInteger(videoDuration) || videoDuration < 1 || videoDuration > 86400) return json({error:"أدخل مدة الفيديو بالثواني (من ثانية إلى 24 ساعة)."},400);
      await db.prepare("INSERT INTO lessons (id,unit_id,title,summary,content,video_url,video_duration_seconds,sort_order,published,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(id,clean(body.unitId,80)||null,title,clean(body.summary,1000),content,videoUrl,videoDuration,Number(body.sortOrder)||0,published,admin.user.id).run();
    } else if (type === "lesson-video") {
      const lessonId = clean(body.lessonId,80), videoUrl = clean(body.videoUrl,1500), videoDuration = Number(body.videoDurationSeconds);
      if (!lessonId || !/^https:\/\//i.test(videoUrl) || !Number.isInteger(videoDuration) || videoDuration < 1 || videoDuration > 86400) return json({error:"اختر درساً موجوداً وأدخل رابط فيديو HTTPS ومدته بالثواني."},400);
      const existing = await db.prepare("SELECT id FROM lessons WHERE id=?").bind(lessonId).first();
      if (!existing) return json({error:"الدرس المحدد غير موجود"},404);
      await db.prepare("UPDATE lessons SET video_url=?,video_duration_seconds=? WHERE id=?").bind(videoUrl,videoDuration,lessonId).run();
      await db.prepare("DELETE FROM student_progress WHERE lesson_id=?").bind(lessonId).run();
      await db.prepare("DELETE FROM lesson_video_progress WHERE lesson_id=?").bind(lessonId).run();
    } else if (type === "experiment") {
      const title = clean(body.title,160), materials = Array.isArray(body.materials)?body.materials.slice(0,30):[], steps = Array.isArray(body.steps)?body.steps.slice(0,30):[];
      if (title.length < 3 || steps.length < 1) return json({error:"عنوان التجربة وخطوة واحدة على الأقل مطلوبة"},400);
      await db.prepare("INSERT INTO experiments (id,unit_id,title,objective,safety_notes,materials_json,steps_json,observations,conclusion,simulation_type,published,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id,clean(body.unitId,80)||null,title,clean(body.objective,2000),clean(body.safetyNotes,3000),JSON.stringify(materials.map(x=>clean(x,300))),JSON.stringify(steps.map(x=>clean(x,1000))),clean(body.observations,3000),clean(body.conclusion,3000),clean(body.simulationType,40)||"none",published,admin.user.id).run();
    } else if (type === "resource") {
      const title = clean(body.title,160), url = clean(body.url,1500);
      if (title.length < 3 || !/^https:\/\//i.test(url)) return json({error:"أدخل عنواناً ورابط HTTPS صالحاً"},400);
      await db.prepare("INSERT INTO resources (id,unit_id,lesson_id,title,description,resource_type,resource_url,published,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(id,clean(body.unitId,80)||null,clean(body.lessonId,80)||null,title,clean(body.description,1000),clean(body.resourceType,30)||"link",url,published,admin.user.id).run();
    } else if (type === "announcement") {
      const title = clean(body.title,160), message = clean(body.body,4000);
      if (title.length < 3 || message.length < 5) return json({error:"عنوان الإعلان ونصه مطلوبان"},400);
      await db.prepare("INSERT INTO announcements (id,title,body,published,created_by) VALUES (?,?,?,?,?)")
        .bind(id,title,message,published,admin.user.id).run();
    }
  } catch (error) {
    return json({error:"تعذر حفظ المحتوى. تأكد من تطبيق تحديث قاعدة البيانات.",detail:String(error?.message||"")},500);
  }
  return json({ok:true,id,published:!!published},201);
}
