import { json, readJson } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";

const MAX_HISTORY = 12;
const MAX_MESSAGE = 5000;
const MAX_IMAGE_DATA = 4_500_000;
const SYSTEM = `أنت مساعد تعليمي متخصص في الكيمياء للمرحلة الثانوية في المملكة العربية السعودية. أجب بالعربية الواضحة، واشرح خطوة بخطوة، ووازن المعادلات بدقة، واذكر الوحدات. لا تخترع حقائق عن المنهج. إذا كان السؤال خارج الكيمياء فاعتذر بلطف وأعد توجيهه للمادة. لا تقدم تعليمات لتنفيذ تجارب خطرة أو خلط مواد كيميائية في المنزل؛ وجّه الطالب إلى المحاكاة وإشراف المعلم. للمعلم ساعد في إعداد الاختبارات وبنوك الأسئلة وخطط الدروس والأنشطة والتقويمات، واكتب أسئلة واضحة مع أربعة خيارات وإجابة صحيحة وتفسير عند طلبها. لا تدّعِ أنك معلم بشري.`;

function getAnswer(data) {
  return String(data?.response || data?.result || data?.description || "").trim();
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const ai = context.env.AI;
  if (!ai || typeof ai.run !== "function") return json({ error: "ربط Cloudflare AI غير موجود. تحقق من اسم الربط AI ثم أعد نشر الموقع." }, 503);

  let body;
  try { body = await readJson(context.request); }
  catch { return json({ error: "تعذر قراءة الطلب." }, 400); }

  const message = String(body?.message || "").trim().slice(0, MAX_MESSAGE);
  const mode = String(body?.mode || "chat");
  const history = Array.isArray(body?.history) ? body.history.slice(-MAX_HISTORY).map(x => ({
    role: x?.role === "assistant" ? "assistant" : "user",
    content: String(x?.content || "").slice(0, 2500)
  })).filter(x => x.content) : [];
  const image = body?.image;
  if (image && !(typeof image.data === "string" && image.data.length <= MAX_IMAGE_DATA && /^data:image\/(png|jpeg|webp);base64,/i.test(image.data))) {
    return json({ error: "صيغة الصورة غير مدعومة أو حجمها كبير. استخدم PNG أو JPG أو WEBP بحجم مناسب." }, 400);
  }
  if (!message && !image) return json({ error: "اكتب سؤالك أو أرفق صورة." }, 400);

  const teacherInstruction = mode === "exam"
    ? "أنت الآن في وضع إنشاء اختبار للمعلم. أنشئ اختبار كيمياء جاهزاً من الأسئلة متعددة الخيارات. ابدأ بعنوان مناسب، ثم اكتب كل سؤال بأربعة خيارات (أ، ب، ج، د)، وحدد الإجابة الصحيحة واشرحها باختصار. التزم بالموضوع والفصل وعدد الأسئلة الذي طلبه المعلم. لا تدّعِ أنك حفظت أو نشرت الاختبار."
    : mode === "questions"
      ? "أنت الآن في وضع توليد أسئلة للمعلم. أنشئ أسئلة متنوعة حسب الطلب (اختيار من متعدد، صح وخطأ، أكمل، ومسائل حسابية عند ملاءمتها). ضع الإجابات النموذجية والتفسير، وميّز مستوى الصعوبة."
      : mode === "lesson"
        ? "أنت الآن في وضع إعداد درس للمعلم. أنشئ أهدافاً تعليمية، تمهيداً، شرحاً منظماً، أمثلة، نشاطاً صفياً، وأسئلة تقويم."
        : "";
  const prompt = [SYSTEM, teacherInstruction, ...history.map(x => (x.role === "assistant" ? "المساعد: " : "المستخدم: ") + x.content), message || "حلّل الصورة المرفقة في سياق الكيمياء واشرح ما يظهر فيها."].filter(Boolean).join("\n\n");

  try {
    let result;
    if (image) {
      result = await ai.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt, image: image.data, max_tokens: 1400 });
    } else {
      result = await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
        messages: [
          { role: "system", content: SYSTEM + (teacherInstruction ? "\n" + teacherInstruction : "") },
          ...history,
          { role: "user", content: message }
        ],
        max_tokens: 1400,
        temperature: 0.35
      });
    }
    const answer = getAnswer(result);
    if (!answer) {
      console.error("Cloudflare AI empty response", JSON.stringify(result).slice(0, 500));
      return json({ error: "وصل رد فارغ من نموذج الذكاء الاصطناعي. جرّب مرة أخرى." }, 502);
    }
    return json({ answer });
  } catch (error) {
    const detail = String(error?.message || error);
    console.error("Cloudflare AI error", detail.slice(0, 500));
    const friendly = /limit|quota|billing|rate|neurons/i.test(detail)
      ? "تم استهلاك حد Cloudflare AI المتاح حالياً أو وصلت الطلبات إلى الحد المؤقت. انتظر ثم حاول مجدداً، ويمكن مراجعة Usage في Workers AI."
      : /license|accept|agreement/i.test(detail)
        ? "نموذج فهم الصور يحتاج قبول ترخيص Meta أول مرة من Cloudflare. جرّب سؤالاً نصياً الآن، وسنفعّل الصور بعد قبول الترخيص."
        : "تعذر تشغيل نموذج Cloudflare AI. راجع سجلّات Pages Functions لمعرفة الخطأ، وتأكد من ربط Workers AI باسم AI.";
    return json({ error: friendly }, 502);
  }
}
