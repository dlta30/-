import { requireAdmin } from "../../_lib/auth.js";
import { ensureDriveTable, encryptRefreshToken } from "../../_lib/google-drive.js";

function cookie(request,name){
  const item=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return item?decodeURIComponent(item.slice(name.length+1)):"";
}
function redirect(request,key){
  const url=new URL("/",request.url);url.searchParams.set(key,"1");
  const headers=new Headers({location:url.toString()});
  headers.append("set-cookie","drive_oauth_state=; Path=/api/drive; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  headers.append("set-cookie","drive_oauth_slot=; Path=/api/drive; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(null,{status:302,headers});
}
export async function onRequestGet(context){
  const auth=await requireAdmin(context);
  if(auth.response) return auth.response;
  const {request,env}=context,url=new URL(request.url);
  const state=url.searchParams.get("state");
  const slot=cookie(request,"drive_oauth_slot")==="2"?2:1;
  if(!state || state!==cookie(request,"drive_oauth_state")) return redirect(request,"drive_error");
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET) return redirect(request,"drive_error");
  const redirectUri=new URL("/api/drive/callback",request.url).toString();
  const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({code:url.searchParams.get("code")||"",client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:"authorization_code"})
  });
  if(!tokenResponse.ok) return redirect(request,"drive_error");
  const tokens=await tokenResponse.json();
  if(!tokens.refresh_token) return redirect(request,"drive_error");
  const access=tokens.access_token;
  const profileResponse=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{authorization:"Bearer "+access}});
  if(!profileResponse.ok) return redirect(request,"drive_error");
  const profile=await profileResponse.json();
  const folderResponse=await fetch("https://www.googleapis.com/drive/v3/files?fields=files(id,name)&pageSize=100&q="+encodeURIComponent("name='Chemistry Student Videos' and mimeType='application/vnd.google-apps.folder' and trashed=false"),{headers:{authorization:"Bearer "+access}});
  let folderId=null;
  if(folderResponse.ok){
    const folders=await folderResponse.json();
    folderId=folders.files?.[0]?.id||null;
  }
  if(!folderId){
    const created=await fetch("https://www.googleapis.com/drive/v3/files?fields=id",{method:"POST",headers:{authorization:"Bearer "+access,"content-type":"application/json"},body:JSON.stringify({name:"Chemistry Student Videos",mimeType:"application/vnd.google-apps.folder"})});
    if(created.ok) folderId=(await created.json()).id||null;
  }
  await ensureDriveTable(env.DB);
  const encrypted=await encryptRefreshToken(env,tokens.refresh_token);
  const targetTable=slot===2?"google_drive_account_two":"google_drive_config";
  await env.DB.prepare("INSERT INTO "+targetTable+ (id,refresh_token_cipher,refresh_token_iv,connected_email,folder_id,updated_at) VALUES (1,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET refresh_token_cipher=excluded.refresh_token_cipher,refresh_token_iv=excluded.refresh_token_iv,connected_email=excluded.connected_email,folder_id=excluded.folder_id,updated_at=datetime('now')")
    .bind(encrypted.cipher,encrypted.iv,String(profile.email||"").slice(0,254),folderId).run();
  return redirect(request,"drive_connected");
}
