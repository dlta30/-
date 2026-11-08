const enc = new TextEncoder();
const b64 = bytes => { let s=""; for (const b of new Uint8Array(bytes)) s+=String.fromCharCode(b); return btoa(s); };
const unb64 = value => Uint8Array.from(atob(value), c=>c.charCodeAt(0));

export async function ensureDriveTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS google_drive_config (
    id INTEGER PRIMARY KEY CHECK(id=1), refresh_token_cipher TEXT NOT NULL,
    refresh_token_iv TEXT NOT NULL, connected_email TEXT, folder_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS google_drive_account_two (
    id INTEGER PRIMARY KEY CHECK(id=1), refresh_token_cipher TEXT NOT NULL,
    refresh_token_iv TEXT NOT NULL, connected_email TEXT, folder_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
}
async function cryptoKey(env) {
  if (!env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth secret is not configured.");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(env.GOOGLE_CLIENT_SECRET + "|chemistry-drive-refresh-v1"));
  return crypto.subtle.importKey("raw", raw, {name:"AES-GCM"}, false, ["encrypt","decrypt"]);
}
export async function encryptRefreshToken(env, token) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},await cryptoKey(env),enc.encode(token));
  return {cipher:b64(encrypted),iv:b64(iv)};
}
async function decryptRefreshToken(env,row) {
  const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(row.refresh_token_iv)},await cryptoKey(env),unb64(row.refresh_token_cipher));
  return new TextDecoder().decode(decrypted);
}
const tableFor = slot => Number(slot)===2 ? "google_drive_account_two" : "google_drive_config";
export async function getDriveAccessToken(env,db,slot=1) {
  await ensureDriveTable(db);
  const table=tableFor(slot);
  const row=await db.prepare("SELECT refresh_token_cipher,refresh_token_iv FROM "+table+" WHERE id=1").first();
  if(!row) throw new Error("Google Drive account "+slot+" is not connected.");
  const refreshToken=await decryptRefreshToken(env,row);
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:refreshToken,grant_type:"refresh_token"})});
  if(!response.ok) throw new Error("Google Drive authorization expired. Reconnect Google Drive.");
  const data=await response.json();
  if(!data.access_token) throw new Error("Google did not return an access token.");
  return data.access_token;
}
export async function deleteDriveFile(env,db,fileId,slot=1) {
  const token=await getDriveAccessToken(env,db,slot);
  await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId),{method:"DELETE",headers:{authorization:"Bearer "+token}});
}
export async function uploadDriveVideo(context,file,contentType,size,title,slot=1) {
  const token=await getDriveAccessToken(context.env,context.env.DB,slot);
  const table=tableFor(slot);
  const row=await context.env.DB.prepare("SELECT folder_id FROM "+table+" WHERE id=1").first();
  const metadata={name:title,mimeType:contentType};
  if(row?.folder_id) metadata.parents=[row.folder_id];
  const init=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json","x-upload-content-type":contentType,"x-upload-content-length":String(size)},body:JSON.stringify(metadata)});
  if(!init.ok) throw new Error("تعذر بدء الرفع إلى Google Drive.");
  const uploadUrl=init.headers.get("location");
  if(!uploadUrl) throw new Error("لم يُرجع Google Drive رابط الرفع.");
  const uploaded=await fetch(uploadUrl,{method:"PUT",headers:{"content-type":contentType,"content-length":String(size)},body:file});
  if(!uploaded.ok) throw new Error("فشل حفظ الفيديو في Google Drive.");
  const result=await uploaded.json();
  if(!result.id) throw new Error("لم يُرجع Google Drive معرّف الملف.");
  return result;
}