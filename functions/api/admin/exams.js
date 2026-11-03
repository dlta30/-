import { json, readJson, newId } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
async function ensureTargets(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS exam_targets (id TEXT PRIMARY KEY, exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE, target_type TEXT NOT NULL, target_value TEXT NOT NULL DEFAULT '')").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_exam_targets_exam ON exam_targets(exam_id)").run();
}
export async function onRequestGet(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  await ensureTargets(context.env.DB);
  const rows=await context.env.DB.prepare(`SELECT e.*,u.name AS creator,
    (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
    (SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id) AS attempt_count,
    (SELECT target_type FROM exam_targets t WHERE t.exam_id=e.id LIMIT 1) AS target_type,
    (SELECT target_value FROM exam_targets t WHERE t.exam_id=e.id AND t.target_type='class' LIMIT 1) AS target_class,
    (SELECT COUNT(*) FROM exam_targets t WHERE t.exam_id=e.id AND t.target_type='student') AS target_students
    FROM exams e JOIN users u ON u.id=e.created_by ORDER BY e.created_at DESC`).all();
  return json({exams:rows.results||[]});
}
export async function onRequestPost(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  const body=await readJson(context.request), title=String(body?.title||"").trim();
  const description=String(body?.description||"").trim(), duration=Number(body?.durationMinutes||30);
  const questions=Array.isArray(body?.questions)?body.questions:[];
  const openDate=body?.opensAt?new Date(body.opensAt):null, closeDate=body?.closesAt?new Date(body.closesAt):null;
  const targetType=["all","class","students"].includes(body?.targetType)?body.targetType:"all";
  const targetClass=String(body?.targetClass||"").trim();
  const studentIds=Array.isArray(body?.studentIds)?[...new Set(body.studentIds.map(String))]:[];
  if((openDate&&!Number.isFinite(openDate.getTime()))||(closeDate&&!Number.isFinite(closeDate.getTime())))return json({error:"صيغة التاريخ غير صحيحة"},400);
  const opensAt=openDate?openDate.toISOString():null, closesAt=closeDate?closeDate.toISOString():null;
  if(title.length<3||title.length>160)return json({error:"عنوان الاختبار مطلوب"},400);
  if(!Number.isInteger(duration)||duration<1||duration>300)return json({error:"المدة يجب أن تكون بين 1 و300 دقيقة"},400);
  if(!questions.length||questions.length>100)return json({error:"أضف من سؤال إلى 100 سؤال"},400);
  if(opensAt&&closesAt&&Date.parse(closesAt)<=Date.parse(opensAt))return json({error:"وقت الإغلاق يجب أن يكون بعد الفتح"},400);
  if(targetType==="class"&&!/^2\/[2-5]$/.test(targetClass))return json({error:"اختر الشعبة"},400);
  if(targetType==="students"&&!studentIds.length)return json({error:"حدد طالباً واحداً على الأقل"},400);
  for(const q of questions) if(typeof q.prompt!=="string"||q.prompt.trim().length<2||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(o=>typeof o!=="string"||!o.trim())||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>=q.options.length)return json({error:"تحقق من نص السؤال وخياراته وإجابته"},400);
  await ensureTargets(context.env.DB);
  if(targetType==="students"){
    const found=await context.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='student' AND active=1 AND id IN ("+studentIds.map(()=>"?").join(",")+")").bind(...studentIds).first();
    if(Number(found?.n)!==studentIds.length)return json({error:"بعض الطلاب غير موجودين أو غير نشطين"},400);
  }
  const id=newId();
  await context.env.DB.prepare("INSERT INTO exams (id,title,description,duration_minutes,opens_at,closes_at,status,created_by,semester) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id,title,description,duration,opensAt,closesAt,body.publish===true?"published":"draft",auth.user.id,body.semester==="2"?"2":"1").run();
  const writes=questions.map((q,i)=>context.env.DB.prepare("INSERT INTO questions (id,exam_id,prompt,options_json,correct_index,points,sort_order) VALUES (?,?,?,?,?,?,?)").bind(newId(),id,q.prompt.trim(),JSON.stringify(q.options),q.correctIndex,Number(q.points)||1,i));
  const target=(type,value)=>context.env.DB.prepare("INSERT INTO exam_targets (id,exam_id,target_type,target_value) VALUES (?,?,?,?)").bind(newId(),id,type,value);
  if(targetType==="all")writes.push(target("all",""));
  if(targetType==="class")writes.push(target("class",targetClass));
  if(targetType==="students")for(const sid of studentIds)writes.push(target("student",sid));
  await context.env.DB.batch(writes);
  return json({ok:true,id,message:body.publish===true?"تم إنشاء الاختبار ونشره":"تم حفظ الاختبار كمسودة"},201);
}
export async function onRequestPatch(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  const body=await readJson(context.request), id=String(body?.id||"").trim();
  if(!id||typeof body?.visible!=="boolean")return json({error:"بيانات الإظهار غير مكتملة"},400);
  const exam=await context.env.DB.prepare("SELECT id FROM exams WHERE id=?").bind(id).first();
  if(!exam)return json({error:"الاختبار غير موجود"},404);
  await context.env.DB.prepare("UPDATE exams SET status=? WHERE id=?").bind(body.visible?"published":"draft",id).run();
  return json({ok:true,status:body.visible?"published":"draft"});
}
