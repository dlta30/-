import { json } from "../_lib/http.js";

const REQUIRED_TABLES = [
  "users", "sessions", "exams", "questions", "exam_starts",
  "attempts", "learning_units", "lessons", "experiments",
  "resources", "announcements", "student_progress",
  "experiment_submissions"
];

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, database: "missing", error: "Database binding DB is not configured" }, 503);
  try {
    await env.DB.prepare("SELECT 1").first();
    const checks = await Promise.all(REQUIRED_TABLES.map(async table => {
      try {
        await env.DB.prepare("SELECT 1 FROM " + table + " LIMIT 1").first();
        return { table, ok: true };
      } catch {
        return { table, ok: false };
      }
    }));
    const missing = checks.filter(x => !x.ok).map(x => x.table);
    if (missing.length) {
      return json({ ok: false, database: "connected", schema: "incomplete", missingTables: missing }, 503);
    }
    return json({ ok: true, service: "Hussein Abbas Chemistry", database: "connected", schema: "ready" });
  } catch {
    return json({ ok: false, database: "unavailable", error: "Database connection failed" }, 503);
  }
}
