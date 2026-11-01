import { json } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  try {
    const [overview, students, exams, recent] = await Promise.all([
      db.prepare(`SELECT
        (SELECT COUNT(*) FROM users WHERE role='student' AND active=1) AS active_students,
        (SELECT COUNT(*) FROM exams WHERE status='published') AS published_exams,
        (SELECT COUNT(*) FROM attempts) AS total_attempts,
        (SELECT COUNT(*) FROM lessons WHERE published=1) AS published_lessons,
        (SELECT COALESCE(AVG(CASE WHEN total_points>0 THEN score*100.0/total_points END),0) FROM attempts) AS average_percent`).first(),
      db.prepare(`SELECT u.id,u.name,u.email,COUNT(a.id) AS attempts,
        ROUND(AVG(CASE WHEN a.total_points>0 THEN a.score*100.0/a.total_points END),1) AS average_percent,
        MAX(a.submitted_at) AS last_activity
        FROM users u LEFT JOIN attempts a ON a.student_id=u.id
        WHERE u.role='student' AND u.active=1 GROUP BY u.id
        ORDER BY average_percent ASC, attempts DESC LIMIT 100`).all(),
      db.prepare(`SELECT e.id,e.title,e.semester,COUNT(a.id) AS attempts,
        ROUND(AVG(CASE WHEN a.total_points>0 THEN a.score*100.0/a.total_points END),1) AS average_percent
        FROM exams e LEFT JOIN attempts a ON a.exam_id=e.id
        GROUP BY e.id ORDER BY attempts DESC LIMIT 50`).all(),
      db.prepare(`SELECT a.id,a.score,a.total_points,a.submitted_at,u.name AS student_name,e.title AS exam_title,
        ROUND(CASE WHEN a.total_points>0 THEN a.score*100.0/a.total_points ELSE 0 END,1) AS percentage
        FROM attempts a JOIN users u ON u.id=a.student_id JOIN exams e ON e.id=a.exam_id
        ORDER BY a.submitted_at DESC LIMIT 20`).all()
    ]);
    const rows = students.results || [];
    const needsSupport = rows.filter(s => s.attempts > 0 && Number(s.average_percent) < 60);
    return json({ overview: overview || {}, students: rows, exams: exams.results || [], recent: recent.results || [], needsSupport, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Admin analytics failed:", error?.stack || error);
    return json({ error: "تعذر إنشاء تحليل الأداء", detail: String(error?.message || error) }, 500);
  }
}
