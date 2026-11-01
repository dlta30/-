import { json, readJson } from "../../_lib/http.js";
import { hashPassword, requireUser } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const body = await readJson(context.request);
  const name = String(body?.name || "").trim();
  const password = String(body?.password || "");
  const confirmation = String(body?.confirmation || "");
  if (name.length < 2 || name.length > 40)
    return json({ error: "اسم الحساب يجب أن يكون من حرفين إلى 40 حرفاً" }, 400);
  if (password.length < 8 || password.length > 128)
    return json({ error: "كلمة المرور يجب أن تكون من 8 إلى 128 حرفاً" }, 400);
  if (password !== confirmation)
    return json({ error: "كلمتا المرور غير متطابقتين" }, 400);
  const { salt, hash } = await hashPassword(password);
  await context.env.DB.prepare("UPDATE users SET name=?, password_hash=?, password_salt=? WHERE id=?")
    .bind(name, hash, salt, auth.user.id).run();
  return json({ ok: true, user: { id: auth.user.id, name, email: auth.user.email, role: auth.user.role } });
}
