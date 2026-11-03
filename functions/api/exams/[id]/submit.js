import { json, readJson, newId } from "../../../_lib/http.js";
import { requireUser } from "../../../_lib/auth.js";
export async function onRequestPost(context) {
  const auth=await requireUser(context); if(auth.response)return auth.response;
  if(auth.user.role!=="student")return json({error:"هذا المسار مخصص لحسابات الطلاب"},403);
  const {id}=context.params;
  const exam=await context.env.DB.prepare("SELECT id,status,opens_at,closes_at FROM exams WHERE id=?").bind(id).first();
  if(!exam||exam.status!=="published")return json({error:"الاختبار غير متاح"},404);
  await context.env.DB.prepare("CREATE TABLE IF NOT EXISTS exam_targets (id TEXT PRIMARY KEY, exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE, target_type TEXT NOT NULL, target_value TEXT NOT NULL DEFAULT '')").run();
  const hasTargets=await context.env.DB.prepare("SELECT 1 AS ok FROM exam_targets WHERE exam_id=? LIMIT 1").bind(id).first();
  const assigned=await context.env.DB.prepare("SELECT 1 AS ok FROM exam_targets t WHERE t.exam_id=? AND (t.target_type='all' OR (t.target_type='student' AND t.target_value=?) OR (t.target_type='class' AND t.target_value=(SELECT class_name FROM users WHERE id=?))) LIMIT 1").bind(id,auth.user.id,auth.user.id).first();
  if(hasTargets&&!assigned)return json({error:"هذا الاختبار غير مخصص لحسابك"},403);
  const now=Date.now();
  if((exam.opens_at&&Date.parse(exam.opens_at)>now)||(exam.closes_at&&Date.parse(exam.closes_at)<now))return json({error:"انتهى وقت الاختبار أو لم يبدأ بعد"},403);
  const previous=await context.env.DB.prepare("SELECT id FROM attempts WHERE exam_id=? AND student_id=?").bind(id,auth.user.id).first();
  if(previous)return json({error:"سبق أن أرسلت إجابتك لهذا الاختبار"},409);
  const started=await context.env.DB.prepare("SELECT started_at FROM exam_starts WHERE exam_id=? AND student_id=?").bind(id,auth.user.id).first();
  if(!started)return json({error:"افتح الاختبار من صفحة المنصة أولاً"},400);
  const elapsed=Date.now()-Date.parse(started.started_at+"Z");
  const examMeta=await context.env.DB.prepare("SELECT duration_minutes FROM exams WHERE id=?").bind(id).first();
  if(elapsed>(Number(examMeta.duration_minutes)*60000+120000))return json({error:"انتهى الوقت المحدد للاختبار"},403);
  const body=await readJson(context.request);
  const answers=body?.answers;
  if(!answers||typeof answers!=="object"||Array.isArray(answers))return json({error:"الإجابات غير صالحة"},400);
  const questions=await context.env.DB.prepare("SELECT id,correct_index,points FROM questions WHERE exam_id=?").bind(id).all();
  if(!questions.results?.length)return json({error:"لا توجد أسئلة في هذا الاختبار"},400);
  let score=0,total=0;
  for(const q of questions.results){const pts=Number(q.points)||1;total+=pts;if(Number(answers[q.id])===q.correct_index)score+=pts;}
  const attemptId=newId();
  try{
    await context.env.DB.prepare("INSERT INTO attempts (id,exam_id,student_id,score,total_points,answers_json) VALUES (?,?,?,?,?,?)")
      .bind(attemptId,id,auth.user.id,score,total,JSON.stringify(answers)).run();
  }catch{return json({error:"تم إرسال الاختبار مسبقاً"},409);}
  return json({ok:true,attemptId,score,totalPoints:total,percentage:Math.round(score/total*100)});
}
