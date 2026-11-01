import { json, readJson } from "../../_lib/http.js";
import { verifyPassword, createSession } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) return json({ error: "أدخل البريد وكلمة المرور" }, 400);
    if (email.length > 190 || password.length > 128) return json({ error: "بيانات الدخول غير صالحة" }, 400);
    const user = await env.DB.prepare("SELECT id,name,email,role,active,password_hash,password_salt FROM users WHERE email=?").bind(email).first();
    if (!user || !user.active || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
      return json({ error: "البريد أو كلمة المرور غير صحيحة" }, 401);
    }
    const cookie = await createSession(env.DB, user.id);
    return json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }, 200, { "set-cookie": cookie });
  } catch (error) {
    console.error("Login failed:", error?.stack || error);
    return json({ error: "تعذر تسجيل الدخول مؤقتاً. حاول مرة أخرى، وإذا تكررت المشكلة تواصل مع الأستاذ." }, 500);
  }
}
