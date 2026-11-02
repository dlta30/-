import { json } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  try {
    const [activity, progress] = await Promise.all([
      db.prepare(`
        SELECT * FROM (
          SELECT 'اختبار' AS kind, u.name AS student_name, e.title AS item_title,
            a.submitted_at AS happened_at,
            CAST(ROUND(CASE WHEN a.total_points>0 THEN a.score*100.0/a.total_points ELSE 0 END) AS INTEGER) AS detail
          FROM attempts a JOIN users u ON u.id=a.student_id JOIN exams e ON e.id=a.exam_id
          UNION ALL
          SELECT 'بدء اختبار' AS kind, u.name AS student_name, e.title AS item_title,
            s.started_at AS happened_at, NULL AS detail
          FROM exam_starts s JOIN users u ON u.id=s.student_id JOIN exams e ON e.id=s.exam_id
          UNION ALL
          SELECT 'إكمال درس' AS kind, u.name AS student_name, l.title AS item_title,
            p.completed_at AS happened_at, NULL AS detail
          FROM student_progress p JOIN users u ON u.id=p.student_id JOIN lessons l ON l.id=p.lesson_id
        ) ORDER BY happened_at DESC LIMIT 150
      `).all(),
      db.prepare(`
        SELECT u.id,u.name,u.email,
          (SELECT COUNT(*) FROM student_progress p WHERE p.student_id=u.id) AS completed_lessons,
          (SELECT COUNT(*) FROM exam_starts s WHERE s.student_id=u.id) AS exams_opened,
          (SELECT COUNT(*) FROM attempts a WHERE a.student_id=u.id) AS exams_submitted,
          (SELECT ROUND(AVG(CASE WHEN a.total_points>0 THEN a.score*100.0/a.total_points END),1) FROM attempts a WHERE a.student_id=u.id) AS average_percent,
          (SELECT MAX(x.happened_at) FROM (
            SELECT completed_at AS happened_at FROM student_progress WHERE student_id=u.id
            UNION ALL SELECT submitted_at FROM attempts WHERE student_id=u.id
            UNION ALL SELECT started_at FROM exam_starts WHERE student_id=u.id
          ) x) AS last_activity
        FROM users u WHERE u.role='student' AND u.active=1 ORDER BY last_activity DESC
      `).all()
    ]);
    return json({ activity: activity.results || [], students: progress.results || [], generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Admin activity report failed:", error?.stack || error);
    return json({ error: "تعذر تحميل متابعة نشاط الطلاب" }, 500);
  }
}
