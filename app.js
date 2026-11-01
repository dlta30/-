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
async function logout(){
  try{await api("/api/auth/logout",{method:"POST",body:"{}"});}catch{}
  currentUser=null; $("#studentApp").hidden=true; document.querySelector("main").hidden=false; document.querySelector("main").querySelectorAll(":scope > section:not(#studentApp)").forEach(x=>x.hidden=false); toast("تم تسجيل الخروج");
}
function ensureApp(){
  if($("#studentApp")) return;
  const node=document.createElement("section"); node.id="studentApp"; node.className="wrap section"; node.hidden=true;
  node.innerHTML='<div class="section-head"><div><div class="eyebrow"><i class="dot"></i> مساحة الحساب</div><h2 id="welcomeTitle" style="margin-top:14px">مرحباً</h2><p id="welcomeSub">هذه مساحتك التعليمية الخاصة</p></div><button class="btn ghost" id="logoutBtn">تسجيل الخروج</button></div><div id="appContent"></div>';
  document.querySelector("main").append(node);
  $("#logoutBtn").addEventListener("click",logout);
}
async function showApp(){
  ensureApp(); document.querySelector("main").querySelectorAll(":scope > section:not(#studentApp)").forEach(x=>x.hidden=true);
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
});
