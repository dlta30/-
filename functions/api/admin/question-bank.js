import { json, readJson, newId } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";

async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS question_bank (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    options_json TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL DEFAULT 'متوسط',
    semester TEXT NOT NULL DEFAULT '1',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_question_bank_filter ON question_bank(semester,topic,difficulty)").run();
}
export async function onRequestGet(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  try {
    await ensure(context.env.DB);
    const url=new URL(context.request.url);
    const semester=url.searchParams.get("semester")==="2"?"2":"1";
    const topic=(url.searchParams.get("topic")||"").trim().slice(0,100);
    const q=(url.searchParams.get("q")||"").trim().slice(0,160);
    const rows=await context.env.DB.prepare(`SELECT id,prompt,options_json,correct_index,explanation,topic,difficulty,semester,created_at
      FROM question_bank WHERE semester=? AND (?='' OR topic=?) AND (?='' OR prompt LIKE '%'||?||'%')
      ORDER BY created_at DESC LIMIT 300`).bind(semester,topic,topic,q,q).all();
    return json({questions:(rows.results||[]).map(x=>({...x,options:JSON.parse(x.options_json)}))});
  } catch(error) { return json({error:"تعذر تحميل بنك الأسئلة",detail:String(error?.message||error)},500); }
}
export async function onRequestPost(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  const body=await readJson(context.request);
  const prompt=String(body?.prompt||"").trim().slice(0,2000);
  const options=Array.isArray(body?.options)?body.options.map(x=>String(x).trim().slice(0,500)): [];
  const correctIndex=Number(body?.correctIndex);
  const topic=String(body?.topic||"عام").trim().slice(0,100);
  const explanation=String(body?.explanation||"").trim().slice(0,3000);
  const difficulty=["سهل","متوسط","صعب"].includes(body?.difficulty)?body.difficulty:"متوسط";
  const semester=body?.semester==="2"?"2":"1";
  if(prompt.length<5||options.length<2||options.length>6||options.some(x=>!x)||!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=options.length)
    return json({error:"اكتب سؤالاً واضحاً وخيارين على الأقل وحدد الإجابة الصحيحة"},400);
  try {
    await ensure(context.env.DB);
    const id=newId();
    await context.env.DB.prepare("INSERT INTO question_bank (id,prompt,options_json,correct_index,explanation,topic,difficulty,semester,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id,prompt,JSON.stringify(options),correctIndex,explanation,topic,difficulty,semester,auth.user.id).run();
    return json({ok:true,id},201);
  } catch(error) { return json({error:"تعذر حفظ السؤال",detail:String(error?.message||error)},500); }
}
export async function onRequestDelete(context) {
  const auth=await requireAdmin(context); if(auth.response)return auth.response;
  const id=new URL(context.request.url).searchParams.get("id");
  if(!id)return json({error:"معرّف السؤال مطلوب"},400);
  try { await ensure(context.env.DB); const r=await context.env.DB.prepare("DELETE FROM question_bank WHERE id=?").bind(id).run(); return json({ok:true,deleted:r.meta?.changes||0}); }
  catch(error){return json({error:"تعذر حذف السؤال",detail:String(error?.message||error)},500);}
}
