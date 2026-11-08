import { requireAdmin } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";

export async function onRequestGet(context) {
  const auth=await requireAdmin(context);
  if(auth.response) return auth.response;
  const {request,env}=context;
  if(!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({error:"إعداد Google OAuth غير مكتمل. يلزم GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET."},503);
  const state=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,"0")).join("");
  const redirectUri=new URL("/api/drive/callback",request.url).toString();
  const params=new URLSearchParams({
    client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri,response_type:"code",
    scope:"openid email https://www.googleapis.com/auth/drive.file",
    access_type:"offline",prompt:"consent",include_granted_scopes:"true",state
  });
  const headers=new Headers({location:"https://accounts.google.com/o/oauth2/v2/auth?"+params.toString()});
  headers.append("set-cookie","drive_oauth_state="+state+"; Path=/api/drive; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
  return new Response(null,{status:302,headers});
}
