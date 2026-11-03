import { json, readJson } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";

const MAX_HISTORY = 12;
const MAX_MESSAGE = 5000;
const MAX_IMAGE_DATA = 4_500_000;
const SYSTEM = `أنت مساعد تعليمي متخصص في الكيمياء للمرحلة الثانوية في المملكة العربية السعودية. أجب بالعربية الواضحة، واشرح خطوة بخطوة، ووازن المعادلات بدقة، واذكر الوحدات. لا تخترع حقائق عن المنهج. إذا كان السؤال خارج الكيمياء فاعتذر بلطف وأعد توجيهه للمادة. لا تقدم تعليمات لتنفيذ تجارب خطرة أو خلط مواد كيميائية في المنزل؛ وجّه الطالب إلى المحاكاة وإشراف المعلم. للمعلم ساعد في إعداد الاختبارات وبنوك الأسئلة وخطط الدروس والأنشطة والتقويمات، واكتب أسئلة واضحة مع أربعة خيارات وإجابة صحيحة وتفسير عند طلبها. لا تدّعِ أنك معلم بشري.`;

function getAnswer(data) {
  return String(data?.response || data?.result || data?.description || "").trim();
}

function parseExamDraft(raw) {
  try {
    const text = String(raw || "").replace(/\x60{3}(?:json)?/gi, "").trim();
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const value = JSON.parse(text.slice(start, end + 1));
    const title = String(value.title || "").trim().slice(0, 160);
    const description = String(value.description || "").trim().slice(0, 1000);
    const durationMinutes = Number(value.durationMinutes);
    const semester = value.semester === "2" ? "2" : "1";
    if (title.length < 3 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) return null;
    if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 100) return null;
    const questions = value.questions.map(q => ({
      prompt: String(q?.prompt || "").trim().slice(0, 3000),
      options: Array.isArray(q?.options) ? q.options.slice(0, 6).map(x => String(x || "").trim().slice(0, 500)) : [],
      correctIndex: Number(q?.correctIndex),
      points: Number(q?.points) > 0 ? Number(q.points) : 1
    }));
    if (questions.some(q => q.prompt.length < 2 || q.options.length < 2 || q.options.some(x => !x) || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length)) return null;
    return { title, description, durationMinutes, semester, questions };
  } catch {
    return null;
  }
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
  const teacherModes = new Set(["exam", "questions", "lesson"]);
  if (teacherModes.has(mode) && auth.user.role !== "admin") {
    return json({ error: "هذه الأوضاع مخصصة للمعلم فقط." }, 403);
  }
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
    ? 'أنت الآن في وضع إنشاء اختبار متوسط إلى صعب للمعلم؛ اجعل الأسئلة قائمة على الفهم والتحليل والاستنتاج والتطبيق والمسائل الحسابية متعددة الخطوات، وتجنب أسئلة الحفظ السهلة. أخرج JSON صالحاً فقط دون Markdown أو أي نص خارجه، وبالمفاتيح التالية حرفياً: {"title":"عنوان الاختبار","description":"وصف مختصر","semester":"1 أو 2","durationMinutes":30,"questions":[{"prompt":"نص السؤال","options":["الخيار أ","الخيار ب","الخيار ج","الخيار د"],"correctIndex":0,"points":1}]}. التزم بعدد الأسئلة والموضوع والفصل والمدة التي طلبها المعلم. اجعل لكل سؤال 4 خيارات وإجابة صحيحة واحدة، وتحقق علمياً من الإجابات. إذا لم يحدد المعلم الفصل فاستخدم 1، وإذا لم يحدد المدة فاستخدم 30 دقيقة، وإذا لم يحدد العدد فاستخدم 10 أسئلة. لا تضع الإجابة الصحيحة في نص السؤال ولا تضف مفاتيح غير المذكورة.'
    : mode === "questions"
      ? "أنت الآن في وضع توليد أسئلة للمعلم. أنشئ أسئلة متنوعة حسب الطلب (اختيار من متعدد، صح وخطأ، أكمل، ومسائل حسابية عند ملاءمتها). ضع الإجابات النموذجية والتفسير، وميّز مستوى الصعوبة."
      : mode === "lesson"
        ? "أنت الآن في وضع إعداد درس للمعلم. أنشئ أهدافاً تعليمية، تمهيداً، شرحاً منظماً، أمثلة، نشاطاً صفياً، وأسئلة تقويم."
        : "";
  const prompt = [SYSTEM, teacherInstruction, ...history.map(x => (x.role === "assistant" ? "المساعد: " : "المستخدم: ") + x.content), message || "حلّل الصورة المرفقة في سياق الكيمياء واشرح ما يظهر فيها."].filter(Boolean).join("\n\n");

  try {
    let result;
    if (image) {
      result = await ai.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt, image: image.data, max_tokens: mode === "exam" ? 4096 : 1400 });
    } else {
      result = await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
        messages: [
          { role: "system", content: SYSTEM + (teacherInstruction ? "\n" + teacherInstruction : "") },
          ...history,
          { role: "user", content: message }
        ],
        max_tokens: mode === "exam" ? 4096 : 1400,
        temperature: 0.35
      });
    }
    const answer = getAnswer(result);
    if (!answer) {
      console.error("Cloudflare AI empty response", JSON.stringify(result).slice(0, 500));
      return json({ error: "وصل رد فارغ من نموذج الذكاء الاصطناعي. جرّب مرة أخرى." }, 502);
    }
    const examDraft = mode === "exam" ? parseExamDraft(answer) : null;
    if (mode === "exam" && !examDraft) {
      return json({ answer: "أنشأ المساعد رداً، لكن تعذر تحويله إلى نموذج اختبار منظم. أعد الطلب مع تحديد عدد الأسئلة والمدة والموضوع بوضوح.", rawAnswer: answer });
    }
    const displayAnswer = examDraft
      ? "تم إعداد مسودة اختبار بعنوان «" + examDraft.title + "» تضم " + examDraft.questions.length + " سؤالاً، ومدتها " + examDraft.durationMinutes + " دقيقة. اضغط زر تعبئة نموذج الاختبار لمراجعة الأسئلة قبل النشر."
      : answer;
    return json({ answer: displayAnswer, ...(examDraft ? { examDraft } : {}) });
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
