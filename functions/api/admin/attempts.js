import { json } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
export async function onRequestGet(context) {
  const auth=await requireAdmin(context);if(auth.response)return auth.response;
  const rows=await context.env.DB.prepare(`
    SELECT a.id,a.score,a.total_points,a.submitted_at,u.name AS student_name,u.email AS student_email,e.title AS exam_title
    FROM attempts a JOIN users u ON u.id=a.student_id JOIN exams e ON e.id=a.exam_id
    ORDER BY a.submitted_at DESC LIMIT 500
  `).all();
  return json({attempts:rows.results||[]});
}
