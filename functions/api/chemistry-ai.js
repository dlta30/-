import { json, readJson } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";

const MAX_HISTORY = 12;
const MAX_MESSAGE = 5000;
const MAX_IMAGE_DATA = 4_500_000;
const SYSTEM = `أنت مساعد تعليمي متخصص في الكيمياء للمرحلة الثانوية في المملكة العربية السعودية. أجب بالعربية الواضحة، واشرح خطوة بخطوة عند الحاجة، ووازن المعادلات بدقة، واذكر الوحدات. إذا كانت الصورة غير واضحة فاطلب صورة أوضح ولا تخمّن. لا تقدم تعليمات لتنفيذ تجارب خطرة أو خلط مواد كيميائية في المنزل؛ وجّه الطالب إلى المحاكاة وإشراف المعلم. لا تدّعِ أنك معلم بشري أو أنك تعرف محتوى غير مرفق. إذا كان السؤال خارج الكيمياء فاعتذر بلطف وأعد توجيهه للمادة. للمعلم ساعد في إعداد شرح وأسئلة وأنشطة وتقويمات مناسبة، ولا تخترع حقائق عن المنهج.`;

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const key = context.env.OPENAI_API_KEY;
  if (!key) return json({ error: "مساعد الكيمياء غير مفعّل بعد. تحقق من إعداد OPENAI_API_KEY في Cloudflare Pages." }, 503);
  let body;
  try { body = await readJson(context.request); } catch { return json({ error: "تعذر قراءة الطلب." }, 400); }
  const message = String(body?.message || "").trim().slice(0, MAX_MESSAGE);
  const history = Array.isArray(body?.history) ? body.history.slice(-MAX_HISTORY).map(x => ({
    role: x?.role === "assistant" ? "assistant" : "user",
    content: String(x?.content || "").slice(0, 2500)
  })).filter(x => x.content) : [];
  const content = [];
  if (message) content.push({ type: "input_text", text: message });
  const image = body?.image;
  if (image && typeof image.data === "string" && image.data.length <= MAX_IMAGE_DATA &&
      /^data:image\/(png|jpeg|webp|gif);base64,/i.test(image.data)) {
    content.push({ type: "input_image", image_url: image.data, detail: "high" });
  } else if (image) return json({ error: "صيغة الصورة غير مدعومة أو حجمها كبير. استخدم PNG أو JPG أو WEBP بحجم مناسب." }, 400);
  if (!content.length) return json({ error: "اكتب سؤالك أو أرفق صورة." }, 400);
  const input = [...history, { role: "user", content }];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4.1-mini", instructions: SYSTEM, input, max_output_tokens: 1200 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Chemistry AI provider error", response.status, data?.error?.code || "unknown");
    const providerCode = data?.error?.code || "";\n    const providerMessage = String(data?.error?.message || "");\n    const friendly = providerCode === "insufficient_quota" || /quota|billing|credits/i.test(providerMessage) ? "رصيد أو حد استخدام واجهة الذكاء الاصطناعي غير كافٍ. يحتاج مالك المنصة إلى تفعيل الفوترة أو زيادة الرصيد في حساب OpenAI." : response.status === 429 ? "الطلبات كثيرة حالياً. انتظر دقيقة ثم أعد الإرسال." : "تعذر الحصول على إجابة الآن. حاول مرة أخرى.";\n    return json({ error: friendly }, 502);
  }
  const answer = (data.output || []).flatMap(x => x.content || []).filter(x => x.type === "output_text").map(x => x.text).join("\n").trim();
  if (!answer) return json({ error: "لم يصل رد واضح من المساعد. أعد صياغة السؤال." }, 502);
  return json({ answer });
}
