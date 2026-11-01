import { json, readJson, newId } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
export async function onRequestGet(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  const rows=await context.env.DB.prepare(`
    SELECT e.*,u.name AS creator,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id) AS attempt_count
    FROM exams e JOIN users u ON u.id=e.created_by ORDER BY e.created_at DESC
  `).all();
  return json({ exams:rows.results || [] });
}
export async function onRequestPost(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  const body=await readJson(context.request);
  const title=String(body?.title||"").trim();
  const description=String(body?.description||"").trim();
  const duration=Number(body?.durationMinutes||30);
  const questions=Array.isArray(body?.questions)?body.questions:[];
  const openDate=body?.opensAt?new Date(body.opensAt):null;
  const closeDate=body?.closesAt?new Date(body.closesAt):null;
  if((openDate&&!Number.isFinite(openDate.getTime()))||(closeDate&&!Number.isFinite(closeDate.getTime())))return json({error:"صيغة تاريخ فتح أو إغلاق الاختبار غير صحيحة"},400);
  const opensAt=openDate?openDate.toISOString():null;
  const closesAt=closeDate?closeDate.toISOString():null;
  if(title.length<3||title.length>160)return json({error:"عنوان الاختبار مطلوب (3 إلى 160 حرفاً)"},400);
  if(!Number.isInteger(duration)||duration<1||duration>300)return json({error:"مدة الاختبار يجب أن تكون بين دقيقة و300 دقيقة"},400);
  if(questions.length<1||questions.length>100)return json({error:"أضف سؤالاً واحداً على الأقل (حتى 100 سؤال)"},400);
  if(opensAt&&closesAt&&Date.parse(closesAt)<=Date.parse(opensAt))return json({error:"وقت الإغلاق يجب أن يكون بعد وقت الفتح"},400);
  for(const q of questions){
    if(typeof q.prompt!=="string"||q.prompt.trim().length<2||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(o=>typeof o!=="string"||!o.trim())||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>=q.options.length)
      return json({error:"تحقق من نص كل سؤال وخياراته والإجابة الصحيحة"},400);
  }
  const id=newId();
  await context.env.DB.prepare("INSERT INTO exams (id,title,description,duration_minutes,opens_at,closes_at,status,created_by) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id,title,description,duration,opensAt,closesAt,body.publish===true?"published":"draft",auth.user.id).run();
  const stmt=context.env.DB.prepare("INSERT INTO questions (id,exam_id,prompt,options_json,correct_index,points,sort_order) VALUES (?,?,?,?,?,?,?)");
  await context.env.DB.batch(questions.map((q,i)=>stmt.bind(newId(),id,q.prompt.trim(),JSON.stringify(q.options),q.correctIndex,Number(q.points)||1,i)));
  return json({ok:true,id,message:body.publish===true?"تم إنشاء الاختبار ونشره":"تم حفظ الاختبار كمسودة"},201);
}
