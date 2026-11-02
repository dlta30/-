import { json, readJson, newId } from "../../_lib/http.js";
import { hashPassword, createSession } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const name = String(body?.name || "").trim().replace(/\\s+/g, " ");
    const email = String(body?.email || body?.identifier || "").trim().toLowerCase();
    const password = typeof body?.password === "string" ? body.password : "";

    if (name.length < 2 || name.length > 80) {
      return json({ error: "اكتب اسمك بشكل صحيح (من حرفين إلى 80 حرفاً)." }, 400);
    }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 190) {
      return json({ error: "أدخل بريداً إلكترونياً صحيحاً." }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل." }, 400);
    }

    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if (existing) return json({ error: "هذا البريد مسجل مسبقاً. سجّل الدخول بدلاً من إنشاء حساب جديد." }, 409);

    const credentials = await hashPassword(password);
    const id = newId();
    await env.DB.prepare("INSERT INTO users (id,name,email,password_hash,password_salt,role) VALUES (?,?,?,?,?,'student')")
      .bind(id, name, email, credentials.hash, credentials.salt).run();

    const cookie = await createSession(env.DB, id);
    return json({ user: { id, name, email, role: "student" }, created: true }, 201, { "set-cookie": cookie });
  } catch (error) {
    console.error("Student registration failed:", error?.stack || error);
    return json({ error: "تعذر إنشاء الحساب حالياً. حاول مرة أخرى." }, 500);
  }
}
