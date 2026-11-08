(() => {
  const MAX_BYTES = 100 * 1024 * 1024;
  const MAX_SECONDS = 300;
  const formatDuration = n => {
    const s = Math.max(0, Math.floor(Number(n)||0));
    return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");
  };
  const prettySize = n => n < 1024*1024 ? Math.ceil(n/1024)+" KB" : (n/1024/1024).toFixed(1)+" MB";
  const videoCard = (v, admin) => '<article class="card student-video-card"><div class="student-video-preview"><video controls playsinline preload="none" src="/api/student-videos/file?id='+encodeURIComponent(v.id)+'"></video></div><div class="student-video-info"><div class="rowcard"><div><span class="pill">'+(v.published?'ظاهر للطلاب':'بانتظار مراجعة الأستاذ')+'</span><h3>'+esc(v.title)+'</h3><p>'+esc(v.studentName||'')+' · '+formatDuration(v.durationSeconds)+' · '+prettySize(v.sizeBytes)+'</p></div>'+(admin?'<button class="btn '+(v.published?'ghost':'primary')+' small" data-video-publish="'+esc(v.id)+'" data-published="'+(v.published?'1':'0')+'">'+(v.published?'إخفاء عن الطلاب':'إظهار للطلاب')+'</button>':(v.isMine?'<span class="pill">مقطعي</span>':''))+'</div><small class="notice">'+(v.createdAt?new Date(v.createdAt.replace(" ","T")+"Z").toLocaleString("ar-SA"):"")+'</small></div></article>';
  const style = () => {
    if(document.getElementById("studentVideoStyles")) return;
    const s=document.createElement("style");s.id="studentVideoStyles";s.textContent='.student-video-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:15px}.student-video-card{padding:0;overflow:hidden}.student-video-preview{background:#080b10;aspect-ratio:16/9}.student-video-preview video{width:100%;height:100%;object-fit:contain}.student-video-info{padding:16px}.student-video-info h3{margin:8px 0 3px}.student-video-upload{border:1px dashed var(--gold);border-radius:16px;padding:20px;margin:16px 0}.student-video-upload input[type=file]{width:100%;padding:12px;background:var(--panel2);border-radius:10px}.student-video-note{color:var(--muted);font-size:12px}.student-video-progress{height:8px;background:var(--line);border-radius:9px;overflow:hidden;margin:12px 0}.student-video-progress span{display:block;height:100%;width:0;background:var(--gold)}@media(max-width:520px){.student-video-grid{grid-template-columns:1fr}}';document.head.appendChild(s);
  };
  async function mountStudentVideos(admin) {
    const app=document.querySelector("#appContent"), nav=app?.querySelector(".tabs");
    if(!app||!nav||app.querySelector('[data-video-panel]')) return;
    style();
    const button=document.createElement("button");
    button.type="button";button.className="btn tab";button.textContent="مقاطع طلاب";
    const panel=document.createElement("section");panel.className="panel";panel.dataset.videoPanel="1";
    if(admin){
      button.dataset.admin="student-videos";panel.dataset.adminPanel="student-videos";
      button.onclick=()=>{app.querySelectorAll("[data-admin]").forEach(x=>x.classList.toggle("active",x===button));app.querySelectorAll("[data-admin-panel]").forEach(x=>x.classList.toggle("active",x===panel));};
    } else {
      button.dataset.tab="student-videos";panel.dataset.panel="student-videos";
      button.onclick=()=>{app.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===button));app.querySelectorAll("[data-panel]").forEach(x=>x.classList.toggle("active",x===panel));};
    }
    nav.appendChild(button);app.appendChild(panel);
    await loadVideos(admin,panel);
  }
  async function loadVideos(admin,panel) {
    panel.innerHTML='<div class="empty">جارٍ تحميل مقاطع الطلاب...</div>';
    try {
      const d=await api("/api/student-videos");
      const own=d.videos.filter(v=>v.isMine);
      const others=d.videos.filter(v=>!v.isMine);
      panel.innerHTML=(admin?'<article class="card" style="margin-bottom:15px"><div class="rowcard"><div><h2>إعدادات مقاطع الطلاب</h2><p>عند تفعيل الخيار، يستطيع الطلاب مشاهدة المقاطع التي أظهرها الأستاذ فقط.</p></div><button class="btn '+(d.studentsCanViewOthers?'primary':'ghost')+' small" id="toggleStudentVideoGallery">'+(d.studentsCanViewOthers?'إيقاف مشاهدة مقاطع الآخرين':'السماح للطلاب بمشاهدة مقاطع الآخرين')+'</button></div></article>':'<article class="card" style="margin-bottom:15px"><h2>مقاطع طلاب</h2><p>ارفع مقطعك مباشرة من ألبوم الصور. بعد الرفع لا يمكنك حذفه. الحد الأقصى للمدة 5 دقائق.</p></article>')+
      (!admin?'<form class="student-video-upload" id="studentVideoUpload"><h3>رفع مقطع جديد</h3><div class="field"><label>عنوان المقطع</label><input name="title" maxlength="120" required placeholder="مثال: تجربة تفاعل كيميائي"></div><div class="field"><label>اختر فيديو من الألبوم</label><input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" required></div><div class="student-video-note">الصيغ: MP4 أو WebM أو MOV · الحد الأقصى 5 دقائق و100 ميجابايت.</div><div class="student-video-progress"><span id="studentVideoProgress"></span></div><button class="btn primary" id="studentVideoSubmit">رفع المقطع</button></form>':'')+
      (admin?'<h2>جميع المقاطع ('+d.videos.length+')</h2>': '<h2>مقاطعك</h2>')+
      (own.length||admin?'<div class="student-video-grid">'+(admin?d.videos:own).map(v=>videoCard(v,admin)).join("")+'</div>':'<div class="empty">لم ترفع أي مقطع بعد.</div>')+
      (!admin&&d.studentsCanViewOthers?'<h2 style="margin-top:28px">مقاطع الطلاب المنشورة</h2>'+(others.length?'<div class="student-video-grid">'+others.map(v=>videoCard(v,false)).join("")+'</div>':'<div class="empty">لا توجد مقاطع منشورة للطلاب الآخرين حالياً.</div>'):'');
      if(admin) {
        panel.querySelector("#toggleStudentVideoGallery").onclick=async()=>{try{await api("/api/student-videos/manage",{method:"PATCH",body:JSON.stringify({action:"global",enabled:!d.studentsCanViewOthers})});toast("تم تحديث إتاحة مشاهدة مقاطع الطلاب");await loadVideos(admin,panel);}catch(e){toast(e.message);}};
        panel.querySelectorAll("[data-video-publish]").forEach(b=>b.onclick=async()=>{try{await api("/api/student-videos/manage",{method:"PATCH",body:JSON.stringify({id:b.dataset.videoPublish,published:b.dataset.published!=="1"})});toast(b.dataset.published==="1"?"تم إخفاء المقطع":"تم إظهار المقطع للطلاب");await loadVideos(admin,panel);}catch(e){toast(e.message);}});
      } else {
        const form=panel.querySelector("#studentVideoUpload");
        form.onsubmit=async e=>{
          e.preventDefault();
          const title=form.elements.title.value.trim(),file=form.elements.video.files?.[0];
          if(!title||!file){toast("اكتب عنوان المقطع واختر الفيديو");return;}
          if(file.size>MAX_BYTES){toast("حجم الفيديو أكبر من 100 ميجابايت");return;}
          if(!/^video\/(mp4|webm|quicktime)$/.test(file.type)){toast("اختر فيديو MP4 أو WebM أو MOV");return;}
          const btn=form.querySelector("button");btn.disabled=true;btn.textContent="جارٍ فحص الفيديو...";
          const objectUrl=URL.createObjectURL(file),probe=document.createElement("video");
          probe.preload="metadata";probe.src=objectUrl;
          probe.onloadedmetadata=async()=>{
            const duration=probe.duration;URL.revokeObjectURL(objectUrl);
            if(!Number.isFinite(duration)||duration<=0||duration>MAX_SECONDS){btn.disabled=false;btn.textContent="رفع المقطع";toast("مدة الفيديو يجب ألا تتجاوز 5 دقائق");return;}
            btn.textContent="جارٍ رفع الفيديو...";
            try{
              const result=await new Promise((resolve,reject)=>{
                const xhr=new XMLHttpRequest();
                xhr.open("POST","/api/student-videos");
                xhr.withCredentials=true;
                xhr.setRequestHeader("content-type",file.type);
                xhr.setRequestHeader("x-video-title",encodeURIComponent(title));
                xhr.setRequestHeader("x-video-duration",String(duration));
                xhr.upload.onprogress=event=>{if(event.lengthComputable){const bar=panel.querySelector("#studentVideoProgress");if(bar)bar.style.width=Math.round(event.loaded/event.total*100)+"%";}};
                xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText||"{}");}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(Error(data.error||"تعذر رفع الفيديو"));};
                xhr.onerror=()=>reject(Error("انقطع الاتصال أثناء رفع الفيديو."));
                xhr.send(file);
              });
              toast(result.message||"تم رفع المقطع. لا يمكنك حذفه.");
              await loadVideos(false,panel);
            }catch(err){toast(err.message);btn.disabled=false;btn.textContent="رفع المقطع";}
          };
          probe.onerror=()=>{URL.revokeObjectURL(objectUrl);btn.disabled=false;btn.textContent="رفع المقطع";toast("تعذر قراءة الفيديو. جرّب ملفاً آخر.");};
        };
      }
    } catch(e){panel.innerHTML='<div class="empty">'+esc(e.message)+'</div>';}
  }
  const oldStudent=renderStudent,oldAdmin=renderAdmin;
  renderStudent=async function(){await oldStudent();await mountStudentVideos(false);};
  renderAdmin=async function(){await oldAdmin();await mountStudentVideos(true);};
})();