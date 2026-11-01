import { json } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
export async function onRequestGet(context) {
  const auth=await requireAdmin(context);if(auth.response)return auth.response;
  const rows=await context.env.DB.prepare(`
    SELECT u.id,u.name,u.email,u.active,u.created_at,
      COUNT(a.id) AS attempts,
      COALESCE(SUM(a.score),0) AS earned_points,
      COALESCE(SUM(a.total_points),0) AS total_points
    FROM users u LEFT JOIN attempts a ON a.student_id=u.id
    WHERE u.role='student' GROUP BY u.id ORDER BY u.created_at DESC
  `).all();
  return json({students:rows.results||[]});
}
