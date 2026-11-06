import { json } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth=await requireAdmin(context);
  if(auth.response)return auth.response;
  const db=context.env.DB;
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS acid_speed_scores (
      id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL, correct_count INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL,
      played_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
    const result=await db.prepare(`
      WITH ranked AS (
        SELECT s.*, s.rowid AS attempt_order, ROW_NUMBER() OVER (
          PARTITION BY student_id ORDER BY score DESC, elapsed_ms ASC, played_at ASC, id ASC
        ) AS rn
        FROM acid_speed_scores s
      )
      SELECT u.id AS student_id,u.name,u.email,u.class_name,
        r.score,r.correct_count,r.elapsed_ms,r.played_at,
        (SELECT COUNT(*) FROM acid_speed_scores all_plays
          WHERE all_plays.student_id=r.student_id AND
            (all_plays.played_at<r.played_at OR
             (all_plays.played_at=r.played_at AND all_plays.id<=r.id))) AS attempts_to_best,
        (SELECT COUNT(*) FROM acid_speed_scores all_plays WHERE all_plays.student_id=r.student_id) AS total_attempts
      FROM ranked r JOIN users u ON u.id=r.student_id
      WHERE r.rn=1
      ORDER BY r.score DESC,r.elapsed_ms ASC,r.played_at ASC
    `).all();
    return json({students:result.results||[]});
  } catch(error) {
    console.error("Teacher acid speed results failed",error);
    return json({error:"تعذر تحميل نتائج تحدي السرعة"},500);
  }
}
