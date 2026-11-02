import { json, readJson } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (auth.user.role !== "student") return json({error:"هذه الخاصية مخصصة للطلاب"},403);
  const row = await context.env.DB.prepare("SELECT class_name FROM users WHERE id=?").bind(auth.user.id).first();
  return json({class_name: row?.class_name || ""});
}

export async function onRequestPatch(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (auth.user.role !== "student") return json({error:"هذه الخاصية مخصصة للطلاب"},403);
  const body = await readJson(context.request);
  const className = String(body?.className || "").trim();
  if (!/^2\/[2-5]$/.test(className)) return json({error:"اختر فصلاً من القائمة"},400);
  await context.env.DB.prepare("UPDATE users SET class_name=? WHERE id=? AND role='student'").bind(className,auth.user.id).run();
  return json({ok:true,class_name:"ثاني ثانوي - "+className});
}
