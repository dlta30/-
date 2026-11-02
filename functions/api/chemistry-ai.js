import { json, readJson } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";

const MAX_HISTORY = 12;
const MAX_MESSAGE = 5000;
const MAX_IMAGE_DATA = 4_500_000;
const SYSTEM = `أنت مساعد تعليمي متخصص في الكيمياء للمرحلة الثانوية في المملكة العربية السعودية. أجب بالعربية الواضحة، واشرح خطوة بخطوة عند الحاجة، ووازن المعادلات بدقة، واذكر الوحدات. إذا كانت الصورة غير واضحة فاطلب صورة أوضح ولا تخمّن. لا تقدم تعليمات لتنفيذ تجارب خطرة أو خلط مواد كيميائية في المنزل؛ وجّه الطالب إلى المحاكاة وإشراف المعلم. لا تدّعِ أنك معلم بشري أو أنك تعرف محتوى غير مرفق. إذا كان السؤال خارج الكيمياء فاعتذر بلطف وأعد توجيهه للمادة. للمعلم ساعد في إعداد شرح وأسئلة وأنشطة وتقويمات مناسبة، ولا تخترع حقائق عن المنهج.`;

function extractAnswer(data) {
  if (typeof data?.response === "string") return data.response.trim();
  if (typeof data?.result === "string") return data.result.trim();
  if (typeof data?.description === "string") return data.description.trim();
  return "";
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;

  const ai = context.env.AI;
  if (!ai || typeof ai.run !== "function") {
    return json({ error: "ربط Cloudflare AI غير موجود. تأكد أن اسم الربط AI ثم أعد نشر الموقع." }, 503);
  }

  let body;
  try { body = await readJson(context.request); }
  catch { return json({ error: "تعذر قراءة الطلب." }, 400); }

  const message = String(body?.message || "").trim().slice(0, MAX_MESSAGE);
  const history = Array.isArray(body?.history)
    ? body.history.slice(-MAX_HISTORY).map(x => ({
        role: x?.role === "assistant" ? "assistant" : "user",
        content: String(x?.content || "").slice(0, 2500)
      })).filter(x => x.content)
    : [];

  const image = body?.image;
  if (image && !(typeof image.data === "string" &&
      image.data.length <= MAX_IMAGE_DATA &&
      /^data:image\/(png|jpeg|webp);base64,/i.test(image.data))) {
    return json({ error: "صيغة الصورة غير مدعومة أو حجمها كبير. استخدم PNG أو JPG أو WEBP بحجم مناسب." }, 400);
  }
  if (!message && !image) return json({ error: "اكتب سؤالك أو أرفق صورة." }, 400);

  const transcript = history.map(x => (x.role === "assistant" ? "المساعد" : "الطالب") + ": " + x.content).join("\n");
  const prompt = [SYSTEM, transcript, "الطالب: " + (message || "حلّل الصورة المرفقة في سياق الكيمياء واشرح ما يظهر فيها.")].filter(Boolean).join("\n\n");

  try {
    const model = image ? "@cf/meta/llama-3.2-11b-vision-instruct" : "@cf/meta/llama-3.1-8b-instruct";
    const input = image
      ? { prompt, image: image.data, max_tokens: 1200 }
      : { prompt, max_tokens: 1200 };

    const result = await ai.run(model, input);
    const answer = extractAnswer(result);
    if (!answer) {
      console.error("Cloudflare AI returned an empty response");
      return json({ error: "لم يصل رد واضح من المساعد. أعد صياغة السؤال وحاول مرة أخرى." }, 502);
    }
    return json({ answer });
  } catch (error) {
    console.error("Cloudflare AI error", String(error?.message || error).slice(0, 300));
    const message = String(error?.message || "");
    const friendly = /license|accept|agreement/i.test(message)
      ? "يلزم قبول ترخيص نموذج الصور من Cloudflare أول مرة. جرّب إرسال صورة بعد تفعيل النموذج من لوحة Cloudflare."
      : /limit|quota|billing|rate/i.test(message)
        ? "وصل المساعد إلى حد الاستخدام المتاح حالياً في Cloudflare. حاول لاحقاً."
        : "تعذر الاتصال بمساعد Cloudflare حالياً. تأكد من تفعيل Workers AI والربط ثم حاول مرة أخرى.";
    return json({ error: friendly }, 502);
  }
}
