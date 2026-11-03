import { json } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";
export async function onRequestGet({ params, env, ...context }) {
  const auth=await requireUser({ ...context, env }); if(auth.response)return auth.response;
  const exam=await env.DB.prepare("SELECT id,title,description,duration_minutes,opens_at,closes_at,status FROM exams WHERE id=?").bind(params.id).first();
  if(!exam)return json({error:"الاختبار غير موجود"},404);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS exam_targets (id TEXT PRIMARY KEY, exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE, target_type TEXT NOT NULL, target_value TEXT NOT NULL DEFAULT '')").run();
  if(auth.user.role!=="admin"){
    const hasTargets=await env.DB.prepare("SELECT 1 AS ok FROM exam_targets WHERE exam_id=? LIMIT 1").bind(params.id).first();
    const assigned=await env.DB.prepare("SELECT 1 AS ok FROM exam_targets t WHERE t.exam_id=? AND (t.target_type='all' OR (t.target_type='student' AND t.target_value=?) OR (t.target_type='class' AND t.target_value=(SELECT class_name FROM users WHERE id=?))) LIMIT 1").bind(params.id,auth.user.id,auth.user.id).first();
    if(hasTargets&&!assigned)return json({error:"هذا الاختبار غير مخصص لحسابك"},403);
  }
  if(auth.user.role!=="admin"&&exam.status!=="published")return json({error:"الاختبار غير متاح"},404);
  const attempt=auth.user.role==="student"?await env.DB.prepare("SELECT id,score,total_points,answers_json,submitted_at FROM attempts WHERE exam_id=? AND student_id=?").bind(params.id,auth.user.id).first():null;
  if(attempt){
    const review=await env.DB.prepare("SELECT id,prompt,options_json,correct_index,points,sort_order FROM questions WHERE exam_id=? ORDER BY sort_order").bind(params.id).all();
    let answers={};try{answers=JSON.parse(attempt.answers_json||"{}");}catch{}
    return json({exam,alreadyAttempted:true,result:{score:attempt.score,totalPoints:attempt.total_points,percentage:attempt.total_points?Math.round(attempt.score/attempt.total_points*100):0,submittedAt:attempt.submitted_at},review:(review.results||[]).map(q=>({id:q.id,prompt:q.prompt,options:JSON.parse(q.options_json),correctIndex:q.correct_index,selectedIndex:Number.isInteger(Number(answers[q.id]))?Number(answers[q.id]):-1,points:q.points}))});
  }
  const now=Date.now();
  if(auth.user.role!=="admin"&&((exam.opens_at&&Date.parse(exam.opens_at)>now)||(exam.closes_at&&Date.parse(exam.closes_at)<now)))
    return json({error:"الاختبار غير متاح في الوقت الحالي"},403);
  const questions=await env.DB.prepare("SELECT id,prompt,options_json,points,sort_order FROM questions WHERE exam_id=? ORDER BY sort_order").bind(params.id).all();
  if(auth.user.role==="student"){
    await env.DB.prepare("INSERT OR IGNORE INTO exam_starts (id,exam_id,student_id,started_at) VALUES (?,?,?,datetime('now'))")
      .bind(crypto.randomUUID(),params.id,auth.user.id).run();
  }
  const started=auth.user.role==="student"?await env.DB.prepare("SELECT started_at FROM exam_starts WHERE exam_id=? AND student_id=?").bind(params.id,auth.user.id).first():null;
  return json({exam,alreadyAttempted:!!attempt,startTime:started?.started_at||null,questions:(questions.results||[]).map(q=>({id:q.id,prompt:q.prompt,options:JSON.parse(q.options_json),points:q.points}))});
}
