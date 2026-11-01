const $ = (s) => document.querySelector(s);
let currentUser = null;
let currentSemester = "1";
let examTimerInterval = null;
let examTimedOut = false;
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
  const semesterExams=data.exams.filter(e=>(e.semester||"1")===currentSemester);
  const s={total:semesterExams.length,completed:semesterExams.filter(e=>e.state==="completed").length,missed:semesterExams.filter(e=>e.state==="missed").length};
  $("#appContent").innerHTML='<div class="semester-switch card"><label for="semesterSelect">المقرر الدراسي</label><select id="semesterSelect"><option value="1" '+(currentSemester==="1"?"selected":"")+ '>الفصل الدراسي الأول · كيمياء 2-1</option><option value="2" '+(currentSemester==="2"?"selected":"")+ '>الفصل الدراسي الثاني · كيمياء 2-2</option></select></div>'+'<div class="cards app-stats"><article class="card"><div class="card-icon">📝</div><h3>'+s.total+'</h3><p>إجمالي الاختبارات المنشورة</p></article><article class="card"><div class="card-icon">✅</div><h3>'+s.completed+'</h3><p>اختبارات مكتملة</p></article><article class="card"><div class="card-icon">⚠️</div><h3>'+s.missed+'</h3><p>اختبارات فات موعدها</p></article></div><h2 class="app-heading" id="studentExamsHeading">اختباراتك</h2><div class="testlist" id="studentExams"></div>';
  $("#semesterSelect").onchange=()=>{currentSemester=$("#semesterSelect").value;renderStudent();};
  const list=$("#studentExams");
  if(!semesterExams.length){list.innerHTML='<article class="card"><h3>لا توجد اختبارات منشورة حالياً</h3><p>ستظهر اختبارات الأستاذ هنا فور نشرها.</p></article>';}
  else list.innerHTML=semesterExams.map(e=>{
    const labels={completed:"مكتمل",missed:"فاتك",upcoming:"قريباً",available:"متاح الآن"};
    const action=e.state==="available"||e.state==="completed"?' data-open="'+esc(e.id)+'"':'';
    return '<article class="card test"><div><h3>'+esc(e.title)+'</h3><p>'+esc(e.description||"")+' · '+e.durationMinutes+' دقيقة</p>'+(e.state==="completed"?'<p class="score-line">نتيجتك: '+e.score+' / '+e.totalPoints+'</p>':"")+'</div><div class="test-actions"><span class="pill state-'+e.state+'">'+labels[e.state]+'</span>'+(action?'<button class="btn primary small" data-open="'+esc(e.id)+'">'+(e.state==="completed"?"عرض النتيجة":"ابدأ الاختبار")+'</button>':"")+'</div></article>';
  }).join("");
  list.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openExam(b.dataset.open)));
  await renderLearningStudent();
  renderStudentLabs();
}
function viewResult(e){ $("#appContent").innerHTML = '<div class="card result-card"><h2>نتيجة اختبار: '+esc(e.title)+'</h2><div class="result-number">'+e.score+' / '+e.totalPoints+'</div><button class="btn primary" id="backToStudent">العودة إلى الاختبارات</button></div>'; $("#backToStudent").addEventListener("click",renderStudent); }
async function openExam(id){
  try{
    const data=await api("/api/exams/"+encodeURIComponent(id));
    if(data.alreadyAttempted){const board=await api("/api/dashboard");const result=board.exams.find(x=>x.id===id);if(result)viewResult(result);else toast("سبق أن أكملت هذا الاختبار");return;}
    const exam=data.exam;examTimedOut=false;if(examTimerInterval)clearInterval(examTimerInterval);
    $("#appContent").innerHTML='<button class="btn ghost" id="backDashboard">← العودة</button><div class="card exam-card"><div class="eyebrow">اختبار كيمياء</div><h2>'+esc(exam.title)+'</h2><p>'+esc(exam.description||"")+' · المدة '+exam.duration_minutes+' دقيقة</p><div class="exam-countdown" id="examCountdown">⏱️ جارٍ تجهيز المؤقت...</div><form id="examForm">'+data.questions.map((q,i)=>'<div class="question"><h3>'+(i+1)+'. '+esc(q.prompt)+' <small>('+q.points+' درجة)</small></h3>'+q.options.map((o,j)=>'<label class="answer-option"><input type="radio" name="'+esc(q.id)+'" value="'+j+'" required> '+esc(o)+'</label>').join("")+'</div>').join("")+'<button class="btn primary" type="submit">تسليم الاختبار</button></form></div>';
    $("#backDashboard").addEventListener("click",()=>{if(examTimerInterval)clearInterval(examTimerInterval);renderStudent();});
    const timer=$("#examCountdown"),startedAt=data.startTime?Date.parse(data.startTime.replace(" ","T")+"Z"):Date.now(),deadline=startedAt+Number(exam.duration_minutes)*60000;
    const tick=()=>{const remaining=Math.max(0,deadline-Date.now()),mins=Math.floor(remaining/60000),secs=Math.floor((remaining%60000)/1000);timer.textContent="⏱️ الوقت المتبقي: "+String(mins).padStart(2,"0")+":"+String(secs).padStart(2,"0");if(remaining<=0&&!examTimedOut){examTimedOut=true;timer.textContent="انتهى الوقت — جارٍ تسليم إجاباتك";$("#examForm").querySelectorAll("input[type=radio]").forEach(x=>x.required=false);$("#examForm").requestSubmit();}};tick();examTimerInterval=setInterval(tick,1000);
    $("#examForm").addEventListener("submit",async ev=>{
      ev.preventDefault();
      if(!examTimedOut&&!confirm("هل أنت متأكد من تسليم إجاباتك؟ لا يمكن إعادة المحاولة."))return;
      const answers={}; for(const q of data.questions){const v=new FormData(ev.currentTarget).get(q.id);if(v===null){if(!examTimedOut){toast("أجب عن جميع الأسئلة أولاً");return;}}else answers[q.id]=Number(v);}
      try{if(examTimerInterval)clearInterval(examTimerInterval);const result=await api("/api/exams/"+encodeURIComponent(id)+"/submit",{method:"POST",body:JSON.stringify({answers})});
        $("#appContent").innerHTML='<div class="card result-card"><div class="card-icon">🎉</div><h2>تم تسليم الاختبار بنجاح</h2><div class="result-number">'+result.score+' / '+result.totalPoints+'</div><p>نسبتك: '+result.percentage+'%</p><button class="btn primary" id="backAfterResult">العودة إلى لوحة الطالب</button></div>';
        $("#backAfterResult").addEventListener("click",renderStudent);
      }catch(e){toast(e.message);}
    });
  }catch(e){toast(e.message);}
}
async function renderAdmin(){
  const [exams,students,attempts]=await Promise.all([api("/api/admin/exams"),api("/api/admin/students"),api("/api/admin/attempts")]);
  $("#appContent").innerHTML='<div class="cards app-stats"><article class="card"><div class="card-icon">👨‍🎓</div><h3>'+students.students.length+'</h3><p>الطلاب المسجلون</p></article><article class="card"><div class="card-icon">🧪</div><h3>'+exams.exams.length+'</h3><p>الاختبارات</p></article><article class="card"><div class="card-icon">📊</div><h3>'+attempts.attempts.length+'</h3><p>المحاولات والنتائج</p></article></div><div class="card admin-create"><h2>إنشاء اختبار جديد</h2><form id="createExamForm"><div class="field"><label>الفصل الدراسي</label><select name="semester"><option value="1">الفصل الأول · كيمياء 2-1</option><option value="2">الفصل الثاني · كيمياء 2-2</option></select></div><div class="field"><label>عنوان الاختبار</label><input name="title" required minlength="3" placeholder="مثال: اختبار الروابط الكيميائية"></div><div class="field"><label>وصف الاختبار</label><input name="description" placeholder="الوحدة أو الدرس"></div><div class="field"><label>المدة بالدقائق</label><input name="duration" type="number" min="1" max="300" value="30" required></div><div class="field"><label>وقت الفتح (اختياري)</label><input name="opens" type="datetime-local"></div><div class="field"><label>وقت الإغلاق (اختياري)</label><input name="closes" type="datetime-local"></div><div class="question-builder-head"><div><h3>بناء الأسئلة</h3><p>أضف الأسئلة وحدد الإجابة الصحيحة والدرجة لكل سؤال.</p></div><button class="btn ghost small" type="button" id="addQuestion">＋ إضافة سؤال</button></div><div id="questionBuilder"></div><div class="actions"><button class="btn primary" type="submit" name="publish" value="true">إنشاء ونشر</button><button class="btn ghost" type="submit" name="publish" value="false">حفظ كمسودة</button></div></form></div><h2 class="app-heading">الاختبارات</h2><div class="testlist">'+exams.exams.map(e=>'<article class="card test"><div><h3>'+esc(e.title)+'</h3><p>'+e.question_count+' سؤال · '+e.attempt_count+' محاولة</p></div><span class="pill">'+(e.status==="published"?"منشور":e.status==="draft"?"مسودة":"مؤرشف")+'</span></article>').join("")+'</div><h2 class="app-heading">الطلاب</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>الاسم</th><th>البريد</th><th>المحاولات</th><th>الحالة</th></tr></thead><tbody>'+students.students.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+esc(s.email)+'</td><td>'+s.attempts+'</td><td>'+(s.active?"نشط":"موقوف")+'</td></tr>').join("")+'</tbody></table></div><h2 class="app-heading">آخر النتائج</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>الطالب</th><th>الاختبار</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>'+attempts.attempts.map(a=>'<tr><td>'+esc(a.student_name)+'</td><td>'+esc(a.exam_title)+'</td><td>'+a.score+' / '+a.total_points+'</td><td>'+new Date(a.submitted_at+"Z").toLocaleString("ar-SA")+'</td></tr>').join("")+'</tbody></table></div>';
  const exportBtn=document.createElement("button");exportBtn.className="btn primary";exportBtn.textContent="تنزيل تقرير النتائج PDF";exportBtn.style.margin="8px 0 18px";exportBtn.onclick=()=>{
    const popup=window.open("","_blank","width=1000,height=750");
    if(!popup){toast("اسمح بالنوافذ المنبثقة لتنزيل التقرير");return;}
    const rows=attempts.attempts.map((x,i)=>'<tr><td>'+ (i+1) +'</td><td>'+esc(x.student_name||"—")+'</td><td>'+esc(x.student_email||"—")+'</td><td>'+esc(x.exam_title||"—")+'</td><td><b>'+esc(x.score)+' / '+esc(x.total_points)+'</b></td><td>'+esc(new Date(x.submitted_at+"Z").toLocaleString("ar-SA"))+'</td></tr>').join("");
    const now=new Date().toLocaleString("ar-SA");
    popup.document.open();popup.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير نتائج منصة الكيمياء</title><style>@page{size:A4 landscape;margin:16mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#20242b;margin:0;background:#fff}.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b99b64;padding-bottom:18px;margin-bottom:22px}.brand{font-size:23px;font-weight:800;color:#29251e}.brand small{display:block;font-size:12px;color:#9a7b48;margin-top:6px}.meta{text-align:left;font-size:11px;color:#666;line-height:1.9}.intro{margin:18px 0 22px}.intro h1{font-size:22px;margin:0 0 8px}.intro p{font-size:12px;color:#666;margin:0}.stats{display:flex;gap:12px;margin:18px 0}.stat{border:1px solid #e5dfd3;border-radius:10px;padding:12px 18px;min-width:150px}.stat b{display:block;font-size:20px;color:#9a7b48}.stat span{font-size:11px;color:#666}table{width:100%;border-collapse:collapse;font-size:11px}thead{display:table-header-group}th{background:#29251e;color:#f6eddb;padding:12px 9px;text-align:right}td{padding:10px 9px;border-bottom:1px solid #e9e5dd;text-align:right}tr{break-inside:avoid}.empty{text-align:center;padding:30px;color:#777}.foot{margin-top:25px;padding-top:12px;border-top:1px solid #ddd;display:flex;justify-content:space-between;color:#888;font-size:10px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class="head"><div class="brand">الأستاذ حسين العباس<small>منصة الكيمياء · مدرسة الشيخ محمد بن العثيمين</small></div><div class="meta">تقرير نتائج الطلاب<br>تاريخ الإصدار: '+esc(now)+'</div></header><section class="intro"><h1>سجل نتائج الاختبارات</h1><p>تقرير أداء الطلاب المسجلين في اختبارات منصة الكيمياء.</p></section><section class="stats"><div class="stat"><b>'+attempts.attempts.length+'</b><span>عدد المحاولات</span></div><div class="stat"><b>'+new Set(attempts.attempts.map(x=>x.student_email)).size+'</b><span>عدد الطلاب</span></div><div class="stat"><b>'+ (attempts.attempts.length?Math.round(attempts.attempts.reduce((n,x)=>n+(Number(x.score)||0),0)/attempts.attempts.length):0) +'</b><span>متوسط الدرجات المحصلة</span></div></section><table><thead><tr><th>#</th><th>اسم الطالب</th><th>البريد الإلكتروني</th><th>الاختبار</th><th>الدرجة</th><th>تاريخ التسليم</th></tr></thead><tbody>'+ (rows||'<tr><td class="empty" colspan="6">لا توجد نتائج مسجلة حتى الآن</td></tr>') +'</tbody></table><footer class="foot"><span>BY: Alaa Mohammed</span><span>الأستاذ حسين العباس | منصة الكيمياء</span></footer><script>window.addEventListener("load",()=>window.print());<\/script></body></html>');popup.document.close();
  };$("#appContent").append(exportBtn);
  await renderLearningAdmin();
  const builder=$("#questionBuilder");let questionCount=0;
  function renumberQuestions(){[...builder.children].forEach((el,i)=>el.querySelector(".question-editor-top b").textContent="السؤال "+(i+1));}
  function addQuestionCard(){const n=++questionCount,card=document.createElement("article");card.className="question-editor card";
    card.innerHTML='<div class="question-editor-top"><b>السؤال '+n+'</b><button class="text-danger" type="button" data-remove-question>حذف</button></div><div class="field"><label>نص السؤال</label><textarea data-prompt rows="2" required placeholder="اكتب السؤال هنا..."></textarea></div><div class="options-grid">'+[0,1,2,3].map(i=>'<div class="field"><label>الخيار '+(i+1)+'</label><input data-option="'+i+'" required placeholder="نص الإجابة"></div>').join("")+'</div><div class="question-meta"><div class="field"><label>الإجابة الصحيحة</label><select data-correct><option value="0">الخيار 1</option><option value="1">الخيار 2</option><option value="2">الخيار 3</option><option value="3">الخيار 4</option></select></div><div class="field"><label>الدرجة</label><input data-points type="number" min="1" max="100" value="1" required></div></div>';
    card.querySelector("[data-remove-question]").onclick=()=>{if(builder.children.length===1){toast("يجب وجود سؤال واحد على الأقل");return;}card.remove();renumberQuestions();};builder.append(card);renumberQuestions();}
  $("#addQuestion").onclick=addQuestionCard;addQuestionCard();
  $("#createExamForm").addEventListener("submit",async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget);
    const questions=[...builder.querySelectorAll(".question-editor")].map(card=>({prompt:card.querySelector("[data-prompt]").value.trim(),options:[...card.querySelectorAll("[data-option]")].map(x=>x.value.trim()),correctIndex:Number(card.querySelector("[data-correct]").value),points:Number(card.querySelector("[data-points]").value)}));
    if(questions.some(q=>q.prompt.length<2||q.options.some(o=>!o)||!Number.isInteger(q.points)||q.points<1)){toast("أكمل جميع الأسئلة والخيارات والدرجات");return;}
    try{await api("/api/admin/exams",{method:"POST",body:JSON.stringify({title:fd.get("title"),description:fd.get("description"),semester:fd.get("semester"),durationMinutes:Number(fd.get("duration")),opensAt:fd.get("opens")?new Date(fd.get("opens")).toISOString():null,closesAt:fd.get("closes")?new Date(fd.get("closes")).toISOString():null,questions,publish:ev.submitter?.value==="true"})});toast(ev.submitter?.value==="true"?"تم نشر الاختبار للطلاب":"تم حفظ الاختبار كمسودة");await renderAdmin();}catch(e){toast(e.message);}});
}

function showGooglePasswordSetup(){
  const layer=document.createElement("div");
  layer.className="modal show";
  layer.id="googlePasswordSetup";
  layer.innerHTML='<div class="dialog"><div class="eyebrow">إكمال إنشاء الحساب</div><h2 style="margin-top:16px">جهّز حسابك التعليمي</h2><p>اختر اسماً يظهر للطلاب والمعلم، ثم أنشئ كلمة مرور لتدخل لاحقاً بالبريد وكلمة المرور دون الحاجة إلى Google.</p><form id="googlePasswordForm"><div class="field"><label for="googleAccountName">اسم الحساب (Nickname)</label><input id="googleAccountName" type="text" minlength="2" maxlength="40" required autocomplete="nickname" value="'+esc(currentUser?.name||"")+'" placeholder="اكتب الاسم الذي تريد ظهوره"></div><div class="field"><label for="googleNewPassword">كلمة المرور الجديدة</label><input id="googleNewPassword" type="password" minlength="8" maxlength="128" required autocomplete="new-password" placeholder="8 أحرف على الأقل"></div><div class="field"><label for="googleConfirmPassword">تأكيد كلمة المرور</label><input id="googleConfirmPassword" type="password" minlength="8" maxlength="128" required autocomplete="new-password" placeholder="أعد كتابة كلمة المرور"></div><button class="btn primary" type="submit">حفظ الاسم وكلمة المرور</button></form><div class="notice">اسم الحساب سيظهر في المنصة. لا تشارك كلمة مرورك مع أي شخص.</div></div>';
  document.body.append(layer);
  $("#googlePasswordForm").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const name=$("#googleAccountName").value.trim(),password=$("#googleNewPassword").value,confirmation=$("#googleConfirmPassword").value;
    if(name.length<2||name.length>40){toast("اكتب اسماً من حرفين إلى 40 حرفاً");return;}
    if(password!==confirmation){toast("كلمتا المرور غير متطابقتين");return;}
    const button=ev.currentTarget.querySelector("button[type=submit]");button.disabled=true;button.textContent="جارٍ الحفظ...";
    try{const saved=await api("/api/auth/set-password",{method:"POST",body:JSON.stringify({name,password,confirmation})});if(saved.user)currentUser=saved.user;updateHeaderForUser();$("#welcomeTitle").textContent="مرحباً، "+currentUser.name;layer.remove();const url=new URL(location.href);url.searchParams.delete("google_setup");history.replaceState({},"",url.pathname+url.search+url.hash);toast("تم حفظ اسم الحساب وكلمة المرور");}
    catch(e){toast(e.message);button.disabled=false;button.textContent="حفظ الاسم وكلمة المرور";}
  });
}

async function boot(){
  ensureApp();
  try{const data=await api("/api/auth/me");if(data.user){currentUser=data.user;await showApp();if(new URLSearchParams(location.search).get("google_setup")==="1")showGooglePasswordSetup();}}catch(e){console.error(e);}
}
document.addEventListener("DOMContentLoaded",()=>{
  $("#auth").addEventListener("click",e=>{if(e.target.id==="auth")closeAuth();});
  document.querySelectorAll(".nav a").forEach(link=>link.addEventListener("click",ev=>{
    if(!currentUser)return;
    ev.preventDefault();
    const target=link.getAttribute("href")==="#tests"?"#studentExamsHeading":link.getAttribute("href")==="#features"?"#learningSection":"#studentApp";
    const node=$(target)||$("#studentApp");node.scrollIntoView({behavior:"smooth",block:"start"});
  }));
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
 const semesterUnits=d.units.filter(x=>(x.semester||"1")===currentSemester),unitIds=new Set(semesterUnits.map(x=>x.id));
 const semesterLessons=d.lessons.filter(x=>x.unit_id&&unitIds.has(x.unit_id));
 const semesterExperiments=d.experiments.filter(x=>!x.unit_id||unitIds.has(x.unit_id));
 const semesterResources=d.resources.filter(x=>!x.unit_id||unitIds.has(x.unit_id));
 const units=id=>(d.units.find(x=>x.id===id)||{}).title||"محتوى عام";
 const progressCount=semesterLessons.filter(x=>(d.completedLessons||[]).includes(x.id)).length,progressPct=semesterLessons.length?Math.round(progressCount/semesterLessons.length*100):0;
 root.insertAdjacentHTML("beforeend",'<article class="card learning-progress"><div><span class="pill">إنجازك الدراسي</span><h3>'+progressPct+'% مكتمل</h3><p>'+progressCount+' من '+semesterLessons.length+' درس مكتمل</p></div><div class="progress-track"><span style="width:'+progressPct+'%"></span></div></article>');
 root.insertAdjacentHTML("beforeend",'<h2 class="app-heading" id="learningSection">الدروس والوحدات</h2><div class="cards" id="lessonCards"></div><h2 class="app-heading">التجارب والأنشطة</h2><div class="cards" id="experimentCards"></div><h2 class="app-heading">مصادر التعلم</h2><div class="testlist" id="resourceCards"></div><h2 class="app-heading">إعلانات الأستاذ</h2><div class="testlist" id="announcementCards"></div>');
 root.insertAdjacentHTML("beforeend",'<h2 class="app-heading">مختبر الكيمياء التفاعلي</h2><div class="cards"><article class="card"><div class="card-icon">🧪</div><h3>محاكاة مقياس الرقم الهيدروجيني pH</h3><p>حرّك المؤشر لاستكشاف الفرق بين الحمضي والمتعادل والقاعدي. محاكاة تعليمية وليست قياساً لمادة حقيقية.</p><div class="field"><label>قيمة pH: <b id="phValue">7.0</b></label><input id="phSlider" type="range" min="0" max="14" step="0.5" value="7"></div><div id="phResult" class="ph-result"><b>متعادل</b><span>pH = 7</span></div><div class="ph-scale"><span>حمضي</span><span>متعادل</span><span>قاعدي</span></div></article><article class="card"><div class="card-icon">⚛️</div><h3>مستكشف العناصر</h3><p>ابحث في أول 20 عنصراً من الجدول الدوري.</p><div class="field"><label>اسم العنصر أو رمزه</label><input id="elementSearch" placeholder="مثال: O أو الأكسجين"></div><div id="elementGrid" class="element-grid"></div></article></div>');
 const slider=$("#phSlider"),phOut=$("#phResult");
 const updatePh=()=>{const v=Number(slider.value),kind=v<7?"حمضي":v>7?"قاعدي":"متعادل",color=v<7?"#d85b69":v>7?"#568bd1":"#69a98a";$("#phValue").textContent=v.toFixed(1);phOut.innerHTML="<b>"+kind+"</b><span>قيمة pH = "+v.toFixed(1)+"</span>";phOut.style.borderColor=color;phOut.style.background=color+"20";};slider.oninput=updatePh;
 const elements=[["H","الهيدروجين",1],["He","الهيليوم",2],["Li","الليثيوم",3],["Be","البيريليوم",4],["B","البورون",5],["C","الكربون",6],["N","النيتروجين",7],["O","الأكسجين",8],["F","الفلور",9],["Ne","النيون",10],["Na","الصوديوم",11],["Mg","المغنيسيوم",12],["Al","الألومنيوم",13],["Si","السيليكون",14],["P","الفوسفور",15],["S","الكبريت",16],["Cl","الكلور",17],["Ar","الأرجون",18],["K","البوتاسيوم",19],["Ca","الكالسيوم",20]];
 const drawElements=q=>{$("#elementGrid").innerHTML=elements.filter(e=>(e[0]+e[1]).toLowerCase().includes(q.toLowerCase())).map(e=>'<div class="element-tile"><b>'+e[0]+'</b><span>'+e[1]+'</span><small>'+e[2]+'</small></div>').join("")||'<p>لا توجد نتيجة مطابقة.</p>';};
 $("#elementSearch").oninput=()=>drawElements($("#elementSearch").value);drawElements("");
 $("#lessonCards").innerHTML=semesterLessons.length?semesterLessons.map(x=>'<article class="card"><span class="pill">'+esc(units(x.unit_id))+'</span><h3 style="margin-top:12px">'+esc(x.title)+'</h3><p>'+esc(x.summary)+'</p><button class="btn primary small" data-lesson="'+esc(x.id)+'" style="margin-top:14px">فتح الدرس</button></article>').join(""):'<article class="card"><p>لا توجد دروس منشورة حالياً.</p></article>';
 $("#lessonCards").querySelectorAll("[data-lesson]").forEach(b=>b.onclick=()=>{const x=d.lessons.find(y=>y.id===b.dataset.lesson),done=(d.completedLessons||[]).includes(x.id);$("#appContent").innerHTML='<button class="btn ghost" id="backLessons">العودة</button><article class="card" style="margin-top:16px"><h2>'+esc(x.title)+'</h2><p>'+esc(x.summary)+'</p><div style="white-space:pre-wrap;line-height:2;margin-top:18px">'+esc(x.content)+'</div><button class="btn primary" id="markLesson" style="margin-top:20px">'+(done?"الدرس مكتمل ✓":"تحديد الدرس كمكتمل")+'</button></article>';$("#backLessons").onclick=renderStudent;$("#markLesson").onclick=async()=>{try{await api("/api/learning",{method:"POST",body:JSON.stringify({type:"progress",lessonId:x.id})});toast("تم حفظ تقدمك");await renderStudent();}catch(e){toast(e.message);}};});
 $("#experimentCards").innerHTML=semesterExperiments.length?semesterExperiments.map(x=>'<article class="card"><h3>'+esc(x.title)+'</h3><p>'+esc(x.objective)+'</p><p style="margin-top:10px"><b>السلامة:</b> '+esc(x.safety_notes)+'</p><details style="margin-top:12px"><summary>خطوات النشاط</summary><ol>'+x.steps.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ol></details></article>').join(""):'<article class="card"><p>لا توجد تجارب منشورة حالياً.</p></article>';
 $("#resourceCards").innerHTML=semesterResources.length?semesterResources.map(x=>'<article class="card test"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.description)+'</p></div><a class="btn primary small" href="'+esc(x.resource_url)+'" target="_blank" rel="noopener">فتح المصدر</a></article>').join(""):'<article class="card"><p>لا توجد مصادر منشورة.</p></article>';
 $("#announcementCards").innerHTML=d.announcements.length?d.announcements.map(x=>'<article class="card"><h3>'+esc(x.title)+'</h3><p>'+esc(x.body)+'</p></article>').join(""):'<article class="card"><p>لا توجد إعلانات حالياً.</p></article>';
}
async function renderLearningAdmin(){
 let d=await api("/api/learning");
 const root=$("#appContent");
 if(!d.units.length){
   try{await api("/api/admin/seed-curriculum",{method:"POST",body:"{}"});d=await api("/api/learning");toast("تم تجهيز منهج الفصلين تلقائياً");}
   catch(e){console.error("Curriculum setup:",e);}
 }
 root.insertAdjacentHTML("beforeend",'<div class="card curriculum-seed"><div><h3>منهج الكيمياء · ثاني ثانوي</h3><p>الفصلان 2-1 و2-2 ودروسهما متاحة للطلاب. يمكنك إضافة الدروس والاختبارات والأنشطة من لوحة الأستاذ.</p></div><button class="btn ghost" id="seedCurriculum" type="button">تحديث عرض المنهج</button></div>');
 $("#seedCurriculum").onclick=async()=>{toast("تم تحديث عرض المنهج. يمكنك إضافة محتوى جديد من نموذج نشر المحتوى.");await renderAdmin();};
 const opts=d.units.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("");
 root.insertAdjacentHTML("beforeend",'<h2 class="app-heading">نشر المحتوى التعليمي</h2><div class="card admin-create"><form id="learningForm"><div class="field"><label>الفصل الدراسي</label><select name="semester"><option value="1">الفصل الأول · كيمياء 2-1</option><option value="2">الفصل الثاني · كيمياء 2-2</option></select></div><div class="field"><label>نوع المحتوى</label><select name="type"><option value="unit">وحدة دراسية</option><option value="lesson">درس</option><option value="experiment">تجربة / نشاط افتراضي</option><option value="resource">مصدر تعليمي</option><option value="announcement">إعلان</option></select></div><div class="field"><label>العنوان</label><input name="title" required minlength="3"></div><div class="field"><label>الوصف أو الملخص</label><textarea name="description" rows="3"></textarea></div><div class="field"><label>الوحدة المرتبطة (اختياري)</label><select name="unitId"><option value="">بدون وحدة</option>'+opts+'</select></div><div class="field"><label>محتوى الدرس / خطوات النشاط (كل خطوة بسطر) / رابط المصدر</label><textarea name="content" rows="7"></textarea></div><div class="field"><label>ملاحظات السلامة للتجربة</label><textarea name="safety" rows="3">نشاط تعليمي افتراضي فقط. لا تنفذ أي تجربة بمواد حقيقية دون إشراف المعلم.</textarea></div><label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input type="checkbox" name="publish" checked> نشر للطلاب</label><button class="btn primary" type="submit">حفظ المحتوى</button></form></div>');
 $("#learningForm").onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget),type=fd.get("type"),v=String(fd.get("content")||"");const body={type,title:fd.get("title"),description:fd.get("description"),unitId:fd.get("unitId"),semester:fd.get("semester"),publish:fd.get("publish")==="on"};
 if(type==="lesson"){body.content=v;body.summary=fd.get("description");}
 if(type==="experiment"){body.objective=fd.get("description");body.safetyNotes=fd.get("safety");body.steps=v.split("\n").map(x=>x.trim()).filter(Boolean);}
 if(type==="resource")body.url=v;
 if(type==="announcement")body.body=fd.get("description");
 if(type==="unit")body.sortOrder=d.units.length;
 try{await api("/api/learning",{method:"POST",body:JSON.stringify(body)});toast(body.publish?"تم النشر للطلاب":"تم حفظ المسودة");await renderAdmin();}catch(e){toast(e.message);}
 };
}

function renderStudentLabs(){
  const root=$("#appContent");
  root.insertAdjacentHTML("beforeend",\`
    <section class="learning-lab">
      <div class="section-head"><div><span class="pill">مختبر تفاعلي</span><h2 class="app-heading">لعبة تكوين المركبات الأيونية</h2><p>اختر أيوناً موجباً وأيوناً سالباً، ثم وازن الشحنات لتكوين مركب متعادل.</p></div></div>
      <div class="cards">
        <article class="card ion-game">
          <h3>1. اختر الأيون الموجب</h3>
          <div class="ion-options" id="cationOptions">
            <button type="button" class="ion-choice selected" data-ion="Na" data-charge="1">Na⁺ <small>الصوديوم</small></button>
            <button type="button" class="ion-choice" data-ion="Mg" data-charge="2">Mg²⁺ <small>المغنيسيوم</small></button>
            <button type="button" class="ion-choice" data-ion="Al" data-charge="3">Al³⁺ <small>الألومنيوم</small></button>
            <button type="button" class="ion-choice" data-ion="Ca" data-charge="2">Ca²⁺ <small>الكالسيوم</small></button>
          </div>
          <h3 style="margin-top:22px">2. اختر الأيون السالب</h3>
          <div class="ion-options" id="anionOptions">
            <button type="button" class="ion-choice selected" data-ion="Cl" data-charge="1">Cl⁻ <small>الكلوريد</small></button>
            <button type="button" class="ion-choice" data-ion="O" data-charge="2">O²⁻ <small>الأكسيد</small></button>
            <button type="button" class="ion-choice" data-ion="S" data-charge="2">S²⁻ <small>الكبريتيد</small></button>
            <button type="button" class="ion-choice" data-ion="N" data-charge="3">N³⁻ <small>النتريد</small></button>
          </div>
          <button type="button" class="btn primary" id="balanceIons" style="margin-top:20px">وازن الشحنات واكتشف الصيغة</button>
          <div class="ion-answer" id="ionAnswer" aria-live="polite">اختر الأيونات ثم اضغط «وازن الشحنات».</div>
        </article>
        <article class="card">
          <div class="card-icon">⚖️</div><h3>كيف نكوّن مركباً متعادلاً؟</h3>
          <p>يجب أن يساوي مجموع الشحنات الموجبة مجموع الشحنات السالبة. نستخدم أصغر نسبة صحيحة من الأيونات حتى تصبح الشحنة الكلية صفراً.</p>
          <div class="ion-example"><b>مثال: Mg²⁺ مع Cl⁻</b><p>نحتاج أيون مغنيسيوم واحداً وأيوني كلوريد.</p><strong>MgCl₂</strong><small>+2 − 2 = 0</small></div>
          <p class="notice">نكتب الأيون الموجب أولاً، ولا نكتب الرقم 1 في الصيغة الكيميائية.</p>
        </article>
      </div>
    </section>
    <section class="practice-zone">
      <div class="section-head"><div><span class="pill">تدريب فوري</span><h2 class="app-heading">اختبر فهمك في الأيونات</h2><p>خمسة أسئلة قصيرة مع تصحيح فوري وشرح للإجابة.</p></div></div>
      <article class="card">
        <div class="practice-progress"><span id="practiceStep">السؤال 1 من 5</span><span id="practiceScore">النتيجة: 0</span></div>
        <div class="progress-track"><span id="practiceBar" style="width:20%"></span></div>
        <div id="practiceQuestion" class="practice-question"></div>
        <div id="practiceFeedback" class="practice-feedback" aria-live="polite"></div>
        <div class="practice-actions"><button type="button" class="btn primary" id="practiceNext" disabled>السؤال التالي</button><button type="button" class="btn ghost" id="practiceRestart">إعادة التدريب</button></div>
      </article>
    </section>
  \`);
  const cations=[...$("#cationOptions").querySelectorAll("[data-ion]")],anions=[...$("#anionOptions").querySelectorAll("[data-ion]")];
  let cation=cations[0],anion=anions[0];
  function selectIon(group,button){group.forEach(x=>x.classList.toggle("selected",x===button));}
  cations.forEach(b=>b.onclick=()=>{cation=b;selectIon(cations,b);});
  anions.forEach(b=>b.onclick=()=>{anion=b;selectIon(anions,b);});
  $("#balanceIons").onclick=()=>{
    const a=Number(cation.dataset.charge),b=Number(anion.dataset.charge),g=(x,y)=>y?g(y,x%y):x;
    const ca=b/g(a,b),an=a/g(a,b),sub=n=>n===1?"":String(n).replace(/[0-9]/g,d=>"₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
    const formula=cation.dataset.ion+sub(ca)+anion.dataset.ion+sub(an);
    $("#ionAnswer").innerHTML='<b>'+formula+'</b><span>عدد الأيونات: '+ca+' موجب و'+an+' سالب</span><small>الشحنة الكلية = ('+ca+' × +'+a+') + ('+an+' × −'+b+') = 0</small>';
  };
  const questions=[
    {q:"ما الشحنة المعتادة لأيون الصوديوم؟",o:["−1","+1","+2"],a:1,e:"يفقد الصوديوم إلكتروناً واحداً، فيصبح Na⁺."},
    {q:"ما صيغة المركب الناتج من Mg²⁺ وCl⁻؟",o:["MgCl","MgCl₂","Mg₂Cl"],a:1,e:"نحتاج أيوني كلوريد لمعادلة شحنة مغنيسيوم واحدة."},
    {q:"لماذا يكون المركب الأيوني متعادلاً؟",o:["لأن عدد الذرات متساوٍ دائماً","لأن مجموع الشحنات يساوي صفراً","لأنه لا يحتوي على إلكترونات"],a:1,e:"مجموع الشحنات الموجبة والسالبة في وحدة الصيغة يساوي صفراً."},
    {q:"ما اسم الأيون السالب Cl⁻؟",o:["كلوريد","كلورات","كلور"],a:0,e:"Cl⁻ يسمى أيون الكلوريد."},
    {q:"ما الصيغة الصحيحة لمركب الألومنيوم والأكسيد؟",o:["AlO","Al₂O₃","Al₃O₂"],a:1,e:"تتعادل شحنتا 2Al³⁺ مع 3O²⁻، فتكون الصيغة Al₂O₃."}
  ];
  let index=0,score=0,answered=false;
  const draw=()=>{
    const q=questions[index];answered=false;
    $("#practiceStep").textContent="السؤال "+(index+1)+" من "+questions.length;
    $("#practiceScore").textContent="النتيجة: "+score;
    $("#practiceBar").style.width=((index+1)/questions.length*100)+"%";
    $("#practiceFeedback").textContent="";$("#practiceNext").disabled=true;
    $("#practiceNext").textContent=index===questions.length-1?"عرض النتيجة":"السؤال التالي";
    $("#practiceQuestion").innerHTML='<h3>'+q.q+'</h3><div class="practice-options">'+q.o.map((o,i)=>'<button type="button" class="practice-option" data-answer="'+i+'">'+o+'</button>').join("")+'</div>';
    $("#practiceQuestion").querySelectorAll("[data-answer]").forEach(btn=>btn.onclick=()=>{
      if(answered)return;answered=true;const correct=Number(btn.dataset.answer)===q.a;if(correct)score++;
      $("#practiceQuestion").querySelectorAll("[data-answer]").forEach((b,i)=>{b.disabled=true;if(i===q.a)b.classList.add("correct");else if(i===Number(btn.dataset.answer))b.classList.add("wrong");});
      $("#practiceScore").textContent="النتيجة: "+score;
      $("#practiceFeedback").textContent=(correct?"إجابة صحيحة! ":"ليست صحيحة. ")+q.e;
      $("#practiceNext").disabled=false;
    });
  };
  $("#practiceNext").onclick=()=>{
    if(!answered)return;
    if(index===questions.length-1){
      $("#practiceQuestion").innerHTML='<div class="practice-final"><strong>'+score+' / '+questions.length+'</strong><h3>'+(score>=4?"ممتاز! فهمك للأيونات قوي.":score>=3?"أحسنت، راجع الإجابات وحاول مجدداً.":"لا بأس، راجع المثال ثم أعد التدريب.")+'</h3></div>';
      $("#practiceFeedback").textContent="انتهى التدريب. اضغط إعادة التدريب للمحاولة مرة أخرى.";
      $("#practiceNext").disabled=true;$("#practiceNext").textContent="اكتمل التدريب";
    }else{index++;draw();}
  };
  $("#practiceRestart").onclick=()=>{index=0;score=0;draw();};
  draw();
}

