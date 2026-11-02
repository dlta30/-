import { json } from "../../_lib/http.js";

// Student registration is intentionally Google-only. Keep this endpoint closed
// so clients cannot bypass the public registration flow with arbitrary emails.
export async function onRequestPost() {
  return json({
    error: "إنشاء حسابات الطلاب متاح عبر Google فقط. استخدم زر المتابعة باستخدام Google."
  }, 403);
}
