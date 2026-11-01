import { json, readJson } from "../../../_lib/http.js";
import { hashPassword, requireUser } from "../../../_lib/auth.js";

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const body = await readJson(context.request);
  const password = String(body?.password || "");
  const confirmation = String(body?.confirmation || "");
  if (password.length < 8 || password.length > 128)
    return json({ error: "كلمة المرور يجب أن تكون من 8 إلى 128 حرفاً" }, 400);
  if (password !== confirmation)
    return json({ error: "كلمتا المرور غير متطابقتين" }, 400);
  const { salt, hash } = await hashPassword(password);
  await context.env.DB.prepare("UPDATE users SET password_hash=?, password_salt=? WHERE id=?")
    .bind(hash, salt, auth.user.id).run();
  return json({ ok: true });
}
