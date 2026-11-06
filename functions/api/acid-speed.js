import { json, readJson, newId } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS acid_speed_scores (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    elapsed_ms INTEGER NOT NULL,
    played_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_acid_speed_rank ON acid_speed_scores(score DESC, elapsed_ms ASC, played_at ASC)").run();
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (auth.user.role !== "student") return json({error:"التحدي مخصص للطلاب"},403);
  const db=context.env.DB;
  try {
    await ensureTable(db);
    const [best, leaderboard, total] = await Promise.all([
      db.prepare("SELECT score,elapsed_ms,played_at,rowid AS attempt_order FROM acid_speed_scores WHERE student_id=? ORDER BY score DESC,elapsed_ms ASC,played_at ASC,rowid ASC LIMIT 1").bind(auth.user.id).first(),
      db.prepare(`SELECT u.name, MAX(s.score) AS score,
        MIN(CASE WHEN s.score=(SELECT MAX(s2.score) FROM acid_speed_scores s2 WHERE s2.student_id=s.student_id) THEN s.elapsed_ms END) AS elapsed_ms
        FROM acid_speed_scores s JOIN users u ON u.id=s.student_id
        GROUP BY s.student_id ORDER BY score DESC, elapsed_ms ASC LIMIT 20`).all(),
      db.prepare("SELECT COUNT(*) AS plays FROM acid_speed_scores WHERE student_id=?").bind(auth.user.id).first()
    ]);
    const attemptsToBest=best?.played_at?await db.prepare("undefined").bind(auth.user.id,best.attempt_order).first():{n:0};\n    return json({bestScore:Number(best?.score||0),bestTimeMs:Number(best?.elapsed_ms||0),bestAttempts:Number(attemptsToBest?.n||0),plays:Number(total?.plays||0),leaderboard:leaderboard.results||[]});
  } catch(error) {
    console.error("Acid speed leaderboard failed",error);
    return json({error:"تعذر تحميل لوحة المتصدرين حالياً"},500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (auth.user.role !== "student") return json({error:"التحدي مخصص للطلاب"},403);
  const body=await readJson(context.request);
  const score=Number(body?.score), correct=Number(body?.correctCount), elapsed=Number(body?.elapsedMs);
  if(!Number.isInteger(score)||score<0||score>1000||!Number.isInteger(correct)||correct<0||correct>10||!Number.isInteger(elapsed)||elapsed<1000||elapsed>30000)
    return json({error:"بيانات نتيجة التحدي غير صالحة"},400);
  try {
    const db=context.env.DB;
    await ensureTable(db);
    await db.prepare("INSERT INTO acid_speed_scores (id,student_id,score,correct_count,elapsed_ms) VALUES (?,?,?,?,?)")
      .bind(newId(),auth.user.id,score,correct,elapsed).run();
    const best=await db.prepare("SELECT score,elapsed_ms,played_at FROM acid_speed_scores WHERE student_id=? ORDER BY score DESC,elapsed_ms ASC,played_at ASC,id ASC LIMIT 1").bind(auth.user.id).first();
    const total=await db.prepare("SELECT COUNT(*) AS plays FROM acid_speed_scores WHERE student_id=?").bind(auth.user.id).first();
    const leaderboard=await db.prepare(`SELECT u.name, MAX(s.score) AS score,
      MIN(CASE WHEN s.score=(SELECT MAX(s2.score) FROM acid_speed_scores s2 WHERE s2.student_id=s.student_id) THEN s.elapsed_ms END) AS elapsed_ms
      FROM acid_speed_scores s JOIN users u ON u.id=s.student_id
      GROUP BY s.student_id ORDER BY score DESC,elapsed_ms ASC LIMIT 20`).all();
    const attemptsToBest=await db.prepare("SELECT COUNT(*) AS n FROM acid_speed_scores WHERE student_id=? AND rowid<=?").bind(auth.user.id,best.played_at).first();\n    return json({ok:true,bestScore:Number(best?.score||0),bestTimeMs:Number(best?.elapsed_ms||0),bestAttempts:Number(attemptsToBest?.n||0),plays:Number(total?.plays||0),leaderboard:leaderboard.results||[]});
  } catch(error) {
    console.error("Acid speed score save failed",error);
    return json({error:"تعذر حفظ النتيجة. حاول مرة أخرى."},500);
  }
}
