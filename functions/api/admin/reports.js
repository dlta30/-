import { json } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";

async function ensureColumns(db) {
  const cols=await db.prepare("PRAGMA table_info(users)").all();
  if(!(cols.results||[]).some(x=>x.name==="class_name")) await db.prepare("ALTER TABLE users ADD COLUMN class_name TEXT").run();
}
export async function onRequestGet(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  const db=context.env.DB;
  try {
    await ensureColumns(db);
    const url=new URL(context.request.url);
    const className=url.searchParams.get("class")||"";
    const examId=url.searchParams.get("exam")||"";
    const search=url.searchParams.get("q")||"";
    const rows=await db.prepare(`SELECT a.id,a.exam_id,a.student_id,a.score,a.total_points,a.submitted_at,a.answers_json,
      u.name AS student_name,u.email AS student_email,u.class_name,e.title AS exam_title,e.semester,
      s.started_at,
      CASE WHEN s.started_at IS NOT NULL THEN MAX(0,CAST((julianday(a.submitted_at)-julianday(s.started_at))*86400 AS INTEGER)) ELSE NULL END AS duration_seconds,
      CASE WHEN a.total_points>0 THEN ROUND(a.score*100.0/a.total_points,1) ELSE 0 END AS percentage
      FROM attempts a JOIN users u ON u.id=a.student_id JOIN exams e ON e.id=a.exam_id
      LEFT JOIN exam_starts s ON s.exam_id=a.exam_id AND s.student_id=a.student_id
      WHERE (?='' OR COALESCE(u.class_name,'')=?) AND (?='' OR a.exam_id=?) AND (?='' OR u.name LIKE '%'||?||'%' OR e.title LIKE '%'||?||'%')
      ORDER BY a.submitted_at DESC LIMIT 1000`).bind(className,className,examId,examId,search,search,search).all();
    const attempts=(rows.results||[]).map(x=>({...x,answers:JSON.parse(x.answers_json||"{}")}));
    const classMap=new Map();
    for(const a of attempts){
      const key=a.class_name||"غير محدد";
      if(!classMap.has(key))classMap.set(key,{class_name:key,attempts:0,students:new Set(),sum:0,passed:0});
      const c=classMap.get(key);c.attempts++;c.students.add(a.student_id);c.sum+=Number(a.percentage)||0;if(a.percentage>=60)c.passed++;
    }
    const classes=[...classMap.values()].map(c=>({class_name:c.class_name,attempts:c.attempts,students:c.students.size,average_percent:Number((c.sum/c.attempts).toFixed(1)),pass_rate:Number((c.passed/c.attempts*100).toFixed(1))}));
    const studentMap=new Map();
    for(const a of attempts){
      if(!studentMap.has(a.student_id))studentMap.set(a.student_id,{student_id:a.student_id,student_name:a.student_name,class_name:a.class_name||"غير محدد",attempts:0,sum:0,results:[]});
      const s=studentMap.get(a.student_id);s.attempts++;s.sum+=Number(a.percentage)||0;
      s.results.push({attempt_id:a.id,exam_id:a.exam_id,exam_title:a.exam_title,score:a.score,total_points:a.total_points,percentage:a.percentage,submitted_at:a.submitted_at,duration_seconds:a.duration_seconds});
    }
    const students=[...studentMap.values()].map(s=>({...s,average_percent:Number((s.sum/s.attempts).toFixed(1))}));
    const examIds=[...new Set(attempts.map(a=>a.exam_id))];
    let commonMistakes=[];
    if(examIds.length){
      const qs=await db.prepare("SELECT exam_id,prompt,correct_index FROM questions WHERE exam_id IN ("+examIds.map(()=>"?").join(",")+")").bind(...examIds).all();
      const counts=new Map();
      for(const q of qs.results||[]){
        for(const a of attempts){
          if(a.exam_id!==q.exam_id)continue;
          if(Number(a.answers?.[q.id])!==Number(q.correct_index)){
            const key=q.exam_id+"|"+q.prompt;
            if(!counts.has(key))counts.set(key,{exam_id:q.exam_id,exam_title:a.exam_title,question:q.prompt,wrong_count:0});
            counts.get(key).wrong_count++;
          }
        }
      }
      commonMistakes=[...counts.values()].sort((a,b)=>b.wrong_count-a.wrong_count).slice(0,10);
    }
    return json({attempts,classes,students,commonMistakes,filters:{className,examId,search},generatedAt:new Date().toISOString()});
  } catch(error) {
    console.error("Reports endpoint failed",error?.stack||error);
    return json({error:"تعذر تحميل التقارير",detail:String(error?.message||error)},500);
  }
}
