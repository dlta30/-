const $ = (s) => document.querySelector(s);
let currentUser = null;
let authMode = 'login';
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "حدث خطأ، حاول مرة أخرى");
  return data;
}
function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3500); }
function openAuth(mode){ authMode=mode; renderAuth(); $("#auth").classList.add("show"); }
function closeAuth(){ $("#auth").classList.remove("show"); }
function toggleAuth(){ authMode=authMode==="login"?"register":"login"; renderAuth(); }
function renderAuth(){
  const reg=authMode==="register";
  $("#authTitle").textContent=reg?"إنشاء حساب طالب":"تسجيل الدخول";
  $("#authDesc").textContent=reg?"أنشئ حسابك للوصول إلى الاختبارات ومتابعة مستواك.":"أهلاً بعودتك إلى منصتك التعليمية.";
  $("#nameField").style.display=reg?"grid":"none";
  $("#studentName").required=reg;
  $("#password").minLength=reg?8:1;
  $("#authSubmit").textContent=reg?"إنشاء الحساب":"دخول";
  $("#authSwitch").textContent=reg?"لديك حساب بالفعل؟ سجّل الدخول":"ليس لديك حساب؟ أنشئ حساباً جديداً";
}
async function submitAuth(event){
  event.preventDefault();
  const reg=authMode==="register";
  try {
    const data=await api(reg?"/api/auth/register":"/api/auth/login",{method:"POST",body:JSON.stringify({
      name:$("#studentName").value,email:$("#email").value,password:$("#password").value
    })});
    currentUser=data.user; closeAuth(); await showApp();
  } catch(e){ toast(e.message); }
}
function updateHeaderForUser(){
  const nav=$(".nav"); if(!nav)return;
  let login=$("#headerLogin"), profile=$("#headerProfile"), out=$("#headerLogout");
  if(!login){login=document.createElement("button");login.id="headerLogin";login.className="btn primary";login.textContent="دخول الطالب";login.onclick=()=>openAuth("login");nav.append(login);}
  if(!profile){profile=document.createElement("span");profile.id="headerProfile";profile.className="pill";nav.append(profile);}
  if(!out){out=document.createElement("button");out.id="headerLogout";out.className="btn ghost";out.textContent="تسجيل الخروج";out.onclick=logout;nav.append(out);}
  login.hidden=!!currentUser;profile.hidden=!currentUser;out.hidden=!currentUser;
  if(currentUser)profile.textContent=(currentUser.role==="admin"?"المعلم · ":"الطالب · ")+currentUser.name;
}
async function logout(){
  try{await api("/api/auth/logout",{method:"POST",body:"{}"});}catch{}
  currentUser=null;updateHeaderForUser();$("#studentApp").hidden=true;document.querySelector("main").hidden=false;document.querySelector("main").querySelectorAll(":scope > section:not(#studentApp)").forEach(x=>x.hidden=false);toast("تم تسجيل الخروج");
}
function ensureApp(){
  if($("#studentApp")) return;
  const node=document.createElement("section"); node.id="studentApp"; node.className="wrap section"; node.hidden=true;
  node.innerHTML='<div class="section-head"><div><div class="eyebrow"><i class="dot"></i> مساحة الحساب</div><h2 id="welcomeTitle" style="margin-top:14px">مرحباً</h2><p id="welcomeSub">هذه مساحتك التعليمية الخاصة</p></div><span class="pill">منصة الكيمياء</span></div><div id="appContent"></div>';
  document.querySelector("main").append(node);
}
async function showApp(){
  ensureApp(); updateHeaderForUser(); document.querySelector("main").querySelectorAll(":scope > section:not(#studentApp)").forEach(x=>x.hidden=true);
  $("#studentApp").hidden=false; $("#welcomeTitle").textContent="مرحباً، "+currentUser.name;
  $("#welcomeSub").textContent=currentUser.role==="admin"?"لوحة إدارة منصة الكيمياء":"تابع اختباراتك ودرجاتك والمهام التي فاتتك";
  if(currentUser.role==="admin") await renderAdmin(); else await renderStudent();
}
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function renderStudent(){
  const data=await api("/api/dashboard");
  const s=data.summary;
  $("#appContent").innerHTML='<div class="cards app-stats"><article class="card"><div class="card-icon">📝</div><h3>'+s.total+'</h3><p>إجمالي الاختبارات المنشورة</p></article><article class="card"><div class="card-icon">✅</div><h3>'+s.completed+'</h3><p>اختبارات مكتملة</p></article><article class="card"><div class="card-icon">⚠️</div><h3>'+s.missed+'</h3><p>اختبارات فات موعدها</p></article></div><h2 class="app-heading">اختباراتك</h2><div class="testlist" id="studentExams"></div>';
  const list=$("#studentExams");
  if(!data.exams.length){list.innerHTML='<article class="card"><h3>لا توجد اختبارات منشورة حالياً</h3><p>ستظهر اختبارات الأستاذ هنا فور نشرها.</p></article>';return;}
  list.innerHTML=data.exams.map(e=>{
    const labels={completed:"مكتمل",missed:"فاتك",upcoming:"قريباً",available:"متاح الآن"};
    const action=e.state==="available"||e.state==="completed"?' data-open="'+esc(e.id)+'"':'';
    return '<article class="card test"><div><h3>'+esc(e.title)+'</h3><p>'+esc(e.description||"")+' · '+e.durationMinutes+' دقيقة</p>'+(e.state==="completed"?'<p class="score-line">نتيجتك: '+e.score+' / '+e.totalPoints+'</p>':"")+'</div><div class="test-actions"><span class="pill state-'+e.state+'">'+labels[e.state]+'</span>'+(action?'<button class="btn primary small" data-open="'+esc(e.id)+'">'+(e.state==="completed"?"عرض النتيجة":"ابدأ الاختبار")+'</button>':"")+'</div></article>';
  }).join("");
  list.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openExam(b.dataset.open)));
  await renderLearningStudent();
}
function viewResult(e){ $("#appContent").innerHTML = '<div class="card result-card"><h2>نتيجة اختبار: '+esc(e.title)+'</h2><div class="result-number">'+e.score+' / '+e.totalPoints+'</div><button class="btn primary" id="backToStudent">العودة إلى الاختبارات</button></div>'; $("#backToStudent").addEventListener("click",renderStudent); }
async function openExam(id){
  try{
    const data=await api("/api/exams/"+encodeURIComponent(id));
    if(data.alreadyAttempted){const board=await api("/api/dashboard");const result=board.exams.find(x=>x.id===id);if(result)viewResult(result);else toast("سبق أن أكملت هذا الاختبار");return;}
    const exam=data.exam;
    $("#appContent").innerHTML='<button class="btn ghost" id="backDashboard">← العودة</button><div class="card exam-card"><div class="eyebrow">اختبار كيمياء</div><h2>'+esc(exam.title)+'</h2><p>'+esc(exam.description||"")+' · المدة '+exam.duration_minutes+' دقيقة</p><form id="examForm">'+data.questions.map((q,i)=>'<div class="question"><h3>'+(i+1)+'. '+esc(q.prompt)+' <small>('+q.points+' درجة)</small></h3>'+q.options.map((o,j)=>'<label class="answer-option"><input type="radio" name="'+esc(q.id)+'" value="'+j+'" required> '+esc(o)+'</label>').join("")+'</div>').join("")+'<button class="btn primary" type="submit">تسليم الاختبار</button></form></div>';
    $("#backDashboard").addEventListener("click",renderStudent);
    $("#examForm").addEventListener("submit",async ev=>{
      ev.preventDefault();
      if(!confirm("هل أنت متأكد من تسليم إجاباتك؟ لا يمكن إعادة المحاولة."))return;
      const answers={}; for(const q of data.questions){const v=new FormData(ev.currentTarget).get(q.id);if(v===null){toast("أجب عن جميع الأسئلة أولاً");return;}answers[q.id]=Number(v);}
      try{const result=await api("/api/exams/"+encodeURIComponent(id)+"/submit",{method:"POST",body:JSON.stringify({answers})});
        $("#appContent").innerHTML='<div class="card result-card"><div class="card-icon">🎉</div><h2>تم تسليم الاختبار بنجاح</h2><div class="result-number">'+result.score+' / '+result.totalPoints+'</div><p>نسبتك: '+result.percentage+'%</p><button class="btn primary" id="backAfterResult">العودة إلى لوحة الطالب</button></div>';
        $("#backAfterResult").addEventListener("click",renderStudent);
      }catch(e){toast(e.message);}
    });
  }catch(e){toast(e.message);}
}
async function renderAdmin(){
  const [exams,students,attempts]=await Promise.all([api("/api/admin/exams"),api("/api/admin/students"),api("/api/admin/attempts")]);
  $("#appContent").innerHTML='<div class="cards app-stats"><article class="card"><div class="card-icon">👨‍🎓</div><h3>'+students.students.length+'</h3><p>الطلاب المسجلون</p></article><article class="card"><div class="card-icon">🧪</div><h3>'+exams.exams.length+'</h3><p>الاختبارات</p></article><article class="card"><div class="card-icon">📊</div><h3>'+attempts.attempts.length+'</h3><p>المحاولات والنتائج</p></article></div><div class="card admin-create"><h2>إنشاء اختبار جديد</h2><form id="createExamForm"><div class="field"><label>عنوان الاختبار</label><input name="title" required minlength="3" placeholder="مثال: اختبار الروابط الكيميائية"></div><div class="field"><label>وصف الاختبار</label><input name="description" placeholder="الوحدة أو الدرس"></div><div class="field"><label>المدة بالدقائق</label><input name="duration" type="number" min="1" max="300" value="30" required></div><div class="field"><label>وقت الفتح (اختياري)</label><input name="opens" type="datetime-local"></div><div class="field"><label>وقت الإغلاق (اختياري)</label><input name="closes" type="datetime-local"></div><div class="field"><label>الأسئلة بصيغة JSON</label><textarea name="questions" rows="8" required dir="ltr"></textarea></div><div class="actions"><button class="btn primary" type="submit" name="publish" value="true">إنشاء ونشر</button><button class="btn ghost" type="submit" name="publish" value="false">حفظ كمسودة</button></div></form></div><h2 class="app-heading">الاختبارات</h2><div class="testlist">'+exams.exams.map(e=>'<article class="card test"><div><h3>'+esc(e.title)+'</h3><p>'+e.question_count+' سؤال · '+e.attempt_count+' محاولة</p></div><span class="pill">'+(e.status==="published"?"منشور":e.status==="draft"?"مسودة":"مؤرشف")+'</span></article>').join("")+'</div><h2 class="app-heading">الطلاب</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>الاسم</th><th>البريد</th><th>المحاولات</th><th>الحالة</th></tr></thead><tbody>'+students.students.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+esc(s.email)+'</td><td>'+s.attempts+'</td><td>'+(s.active?"نشط":"موقوف")+'</td></tr>').join("")+'</tbody></table></div><h2 class="app-heading">آخر النتائج</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>الطالب</th><th>الاختبار</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>'+attempts.attempts.map(a=>'<tr><td>'+esc(a.student_name)+'</td><td>'+esc(a.exam_title)+'</td><td>'+a.score+' / '+a.total_points+'</td><td>'+new Date(a.submitted_at+"Z").toLocaleString("ar-SA")+'</td></tr>').join("")+'</tbody></table></div>';
  await renderLearningAdmin();
  $("#createExamForm").addEventListener("submit",async ev=>{
    ev.preventDefault();const form=ev.currentTarget;const fd=new FormData(form);let questions;
    try{questions=JSON.parse(fd.get("questions"));if(!Array.isArray(questions))throw 0;}catch{toast("صيغة الأسئلة JSON غير صحيحة");return;}
    try{await api("/api/admin/exams",{method:"POST",body:JSON.stringify({title:fd.get("title"),description:fd.get("description"),durationMinutes:Number(fd.get("duration")),opensAt:fd.get("opens")?new Date(fd.get("opens")).toISOString():null,closesAt:fd.get("closes")?new Date(fd.get("closes")).toISOString():null,questions,publish:ev.submitter?.value==="true"})});toast("تم حفظ الاختبار");await renderAdmin();}catch(e){toast(e.message);}
  });
}
async function boot(){
  ensureApp();
  try{const data=await api("/api/auth/me");if(data.user){currentUser=data.user;await showApp();}}catch(e){console.error(e);}
}
document.addEventListener("DOMContentLoaded",()=>{
  $("#auth").addEventListener("click",e=>{if(e.target.id==="auth")closeAuth();});
  boot();
  const googleButton = document.createElement("button");
  googleButton.type = "button";
  googleButton.className = "btn ghost";
  googleButton.id = "googleSignIn";
  googleButton.style.width = "100%";
  googleButton.style.marginTop = "10px";
  googleButton.textContent = "المتابعة باستخدام Google";
  googleButton.addEventListener("click", () => { window.location.href = "/api/auth/google"; });
  $("#authForm").append(googleButton);
  const params = new URLSearchParams(window.location.search);
  if (params.has("google_error")) {
    const messages = { config: "تسجيل Google غير مكتمل الإعداد", state: "انتهت صلاحية محاولة تسجيل الدخول، حاول مجدداً", token: "تعذر التحقق من حساب Google", identity: "تعذر التحقق من هوية حساب Google", disabled: "هذا الحساب موقوف، تواصل مع إدارة المنصة", account: "تعذر إنشاء الحساب" };
    const stage = params.get("stage");
    const stageLabels = { token_exchange: "تبادل رمز Google", token_response: "استجابة رمز Google", token_parse: "قراءة رمز Google", identity_check: "التحقق من الهوية", identity_parse: "قراءة بيانات الهوية", database_lookup: "البحث عن حساب الطالب", user_create: "إنشاء حساب الطالب", session_create: "إنشاء جلسة الدخول", start: "بداية المعالجة" };
    const detail = params.get("google_error") === "server" && stage ? " (المرحلة: " + (stageLabels[stage] || stage) + ")" : "";
    toast((messages[params.get("google_error")] || "تعذر تسجيل الدخول باستخدام Google") + detail);
    params.delete("google_error");
    const cleanUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
    history.replaceState({}, "", cleanUrl);
  }
});


async function renderLearningStudent(){
 const d=await api("/api/learning"),root=$("#appContent");
 const units=id=>(d.units.find(x=>x.id===id)||{}).title||"محتوى عام";
 root.insertAdjacentHTML("beforeend",'<h2 class="app-heading">الدروس والوحدات</h2><div class="cards" id="lessonCards"></div><h2 class="app-heading">التجارب والأنشطة</h2><div class="cards" id="experimentCards"></div><h2 class="app-heading">مصادر التعلم</h2><div class="testlist" id="resourceCards"></div><h2 class="app-heading">إعلانات الأستاذ</h2><div class="testlist" id="announcementCards"></div>');
 $("#lessonCards").innerHTML=d.lessons.length?d.lessons.map(x=>'<article class="card"><span class="pill">'+esc(units(x.unit_id))+'</span><h3 style="margin-top:12px">'+esc(x.title)+'</h3><p>'+esc(x.summary)+'</p><button class="btn primary small" data-lesson="'+esc(x.id)+'" style="margin-top:14px">فتح الدرس</button></article>').join(""):'<article class="card"><p>لا توجد دروس منشورة حالياً.</p></article>';
 $("#lessonCards").querySelectorAll("[data-lesson]").forEach(b=>b.onclick=()=>{const x=d.lessons.find(y=>y.id===b.dataset.lesson);$("#appContent").innerHTML='<button class="btn ghost" id="backLessons">العودة</button><article class="card" style="margin-top:16px"><h2>'+esc(x.title)+'</h2><p>'+esc(x.summary)+'</p><div style="white-space:pre-wrap;line-height:2;margin-top:18px">'+esc(x.content)+'</div></article>';$("#backLessons").onclick=renderStudent;});
 $("#experimentCards").innerHTML=d.experiments.length?d.experiments.map(x=>'<article class="card"><h3>'+esc(x.title)+'</h3><p>'+esc(x.objective)+'</p><p style="margin-top:10px"><b>السلامة:</b> '+esc(x.safety_notes)+'</p><details style="margin-top:12px"><summary>خطوات النشاط</summary><ol>'+x.steps.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ol></details></article>').join(""):'<article class="card"><p>لا توجد تجارب منشورة حالياً.</p></article>';
 $("#resourceCards").innerHTML=d.resources.length?d.resources.map(x=>'<article class="card test"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.description)+'</p></div><a class="btn primary small" href="'+esc(x.resource_url)+'" target="_blank" rel="noopener">فتح المصدر</a></article>').join(""):'<article class="card"><p>لا توجد مصادر منشورة.</p></article>';
 $("#announcementCards").innerHTML=d.announcements.length?d.announcements.map(x=>'<article class="card"><h3>'+esc(x.title)+'</h3><p>'+esc(x.body)+'</p></article>').join(""):'<article class="card"><p>لا توجد إعلانات حالياً.</p></article>';
}
async function renderLearningAdmin(){
 const d=await api("/api/learning"),root=$("#appContent");
 const opts=d.units.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("");
 root.insertAdjacentHTML("beforeend",'<h2 class="app-heading">نشر المحتوى التعليمي</h2><div class="card admin-create"><form id="learningForm"><div class="field"><label>نوع المحتوى</label><select name="type"><option value="unit">وحدة دراسية</option><option value="lesson">درس</option><option value="experiment">تجربة / نشاط افتراضي</option><option value="resource">مصدر تعليمي</option><option value="announcement">إعلان</option></select></div><div class="field"><label>العنوان</label><input name="title" required minlength="3"></div><div class="field"><label>الوصف أو الملخص</label><textarea name="description" rows="3"></textarea></div><div class="field"><label>الوحدة المرتبطة (اختياري)</label><select name="unitId"><option value="">بدون وحدة</option>'+opts+'</select></div><div class="field"><label>محتوى الدرس / خطوات النشاط (كل خطوة بسطر) / رابط المصدر</label><textarea name="content" rows="7"></textarea></div><div class="field"><label>ملاحظات السلامة للتجربة</label><textarea name="safety" rows="3">نشاط تعليمي افتراضي فقط. لا تنفذ أي تجربة بمواد حقيقية دون إشراف المعلم.</textarea></div><label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input type="checkbox" name="publish" checked> نشر للطلاب</label><button class="btn primary" type="submit">حفظ المحتوى</button></form></div>');
 $("#learningForm").onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget),type=fd.get("type"),v=String(fd.get("content")||"");const body={type,title:fd.get("title"),description:fd.get("description"),unitId:fd.get("unitId"),publish:fd.get("publish")==="on"};
 if(type==="lesson")body.content=v;
 if(type==="experiment"){body.objective=fd.get("description");body.safetyNotes=fd.get("safety");body.steps=v.split("\n").map(x=>x.trim()).filter(Boolean);}
 if(type==="resource")body.url=v;
 if(type==="announcement")body.body=fd.get("description");
 if(type==="unit")body.sortOrder=d.units.length;
 try{await api("/api/learning",{method:"POST",body:JSON.stringify(body)});toast(body.publish?"تم النشر للطلاب":"تم حفظ المسودة");await renderAdmin();}catch(e){toast(e.message);}
 };
}
