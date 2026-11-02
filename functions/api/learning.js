import { json, readJson, newId } from "../_lib/http.js";
import { requireUser, requireAdmin } from "../_lib/auth.js";

const TYPES = new Set(["unit", "lesson", "experiment", "resource", "announcement"]);
const clean = (v, max = 5000) => String(v ?? "").trim().slice(0, max);

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  // Add video support safely for existing databases.
  const lessonColumns = await db.prepare("PRAGMA table_info(lessons)").all();
  if (!(lessonColumns.results || []).some(x => x.name === "video_url")) await db.prepare("ALTER TABLE lessons ADD COLUMN video_url TEXT NOT NULL DEFAULT ''").run();
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
  return json({
    units: units.results || [], lessons: lessons.results || [],
    experiments: (experiments.results || []).map(x => ({...x, materials: JSON.parse(x.materials_json || "[]"), steps: JSON.parse(x.steps_json || "[]")})),
    resources: resources.results || [], announcements: announcements.results || [],
    completedLessons: (progress.results || []).map(x => x.lesson_id)
  });
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const body = await readJson(context.request);
  const type = clean(body?.type, 30);
  if (type === "progress") {
    if (auth.user.role !== "student") return json({error:"هذا الإجراء مخصص للطلاب"},403);
    const lessonId = clean(body.lessonId, 80);
    const lesson = await context.env.DB.prepare("SELECT id,video_url FROM lessons WHERE id=? AND published=1").bind(lessonId).first();
    if (!lesson) return json({error:"الدرس غير متاح"},404);
    if (lesson.video_url) {
      const watched = Number(body.watchedSeconds || 0), duration = Number(body.durationSeconds || 0);
      if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration < 1 || watched < duration * 0.9) return json({error:"أكمل مشاهدة 90٪ على الأقل من المقطع قبل تسجيل الدرس كمكتمل."},400);
    }
    await context.env.DB.prepare("INSERT OR IGNORE INTO student_progress (id,student_id,lesson_id) VALUES (?,?,?)")
      .bind(newId(), auth.user.id, lessonId).run();
    return json({ok:true});
  }
  const admin = await requireAdmin(context);
  if (admin.response) return admin.response;
  if (!TYPES.has(type)) return json({error:"نوع المحتوى غير معروف"},400);
  const id = newId();
  const published = body.publish === true ? 1 : 0;
  const db = context.env.DB;
  try {
    if (type === "unit") {
      const title = clean(body.title,160);
      if (title.length < 3) return json({error:"اكتب عنوان الوحدة"},400);
      await db.prepare("INSERT INTO learning_units (id,title,description,sort_order,published,created_by,semester) VALUES (?,?,?,?,?,?,?)")
        .bind(id,title,clean(body.description,1000),Number(body.sortOrder)||0,published,admin.user.id,body.semester==="2"?"2":"1").run();
    } else if (type === "lesson") {
      const title = clean(body.title,160), content = clean(body.content,20000), videoUrl = clean(body.videoUrl,1500);
      if (title.length < 3 || content.length < 10) return json({error:"عنوان الدرس ومحتواه مطلوبان"},400);
      await db.prepare("INSERT INTO lessons (id,unit_id,title,summary,content,video_url,sort_order,published,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(id,clean(body.unitId,80)||null,title,clean(body.summary,1000),content,videoUrl,Number(body.sortOrder)||0,published,admin.user.id).run();
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
