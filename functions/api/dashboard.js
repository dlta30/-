import { json } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";
export async function onRequestGet(context) {
  const auth = await requireUser(context); if (auth.response) return auth.response;
  const { user } = auth;
  if (user.role === "admin") return json({ user, admin: true });
  const exams = await context.env.DB.prepare(`
    SELECT e.id,e.title,e.description,e.duration_minutes,e.opens_at,e.closes_at,e.status,e.semester,
      a.id AS attempt_id,a.score,a.total_points,a.submitted_at
    FROM exams e LEFT JOIN attempts a ON a.exam_id=e.id AND a.student_id=?
    WHERE e.status='published'
    ORDER BY COALESCE(e.opens_at,e.created_at) DESC
  `).bind(user.id).all();
  const now = Date.now();
  const items = (exams.results || []).map(e => {
    const opens = e.opens_at ? Date.parse(e.opens_at) : null;
    const closes = e.closes_at ? Date.parse(e.closes_at) : null;
    const upcoming = opens !== null && opens > now;
    const closed = closes !== null && closes < now;
    let state = e.attempt_id ? "completed" : upcoming ? "upcoming" : closed ? "missed" : "available";
    return { id:e.id,title:e.title,description:e.description,semester:e.semester||"1",durationMinutes:e.duration_minutes,opensAt:e.opens_at,closesAt:e.closes_at,state,score:e.score,totalPoints:e.total_points,submittedAt:e.submitted_at };
  });
  const attempts = items.filter(x=>x.state==="completed");
  return json({ user:{id:user.id,name:user.name,email:user.email,role:user.role}, exams:items,
    summary:{total:items.length,completed:attempts.length,missed:items.filter(x=>x.state==="missed").length,available:items.filter(x=>x.state==="available").length} });
}
