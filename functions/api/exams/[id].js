import { json } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";
export async function onRequestGet({ params, env, ...context }) {
  const auth=await requireUser({ ...context, env }); if(auth.response)return auth.response;
  const exam=await env.DB.prepare("SELECT id,title,description,duration_minutes,opens_at,closes_at,status FROM exams WHERE id=?").bind(params.id).first();
  if(!exam)return json({error:"الاختبار غير موجود"},404);
  if(auth.user.role!=="admin"&&exam.status!=="published")return json({error:"الاختبار غير متاح"},404);
  const attempt=auth.user.role==="student"?await env.DB.prepare("SELECT id FROM attempts WHERE exam_id=? AND student_id=?").bind(params.id,auth.user.id).first():null;
  if(attempt)return json({exam,alreadyAttempted:true});
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
