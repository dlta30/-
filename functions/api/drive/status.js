import { requireAdmin } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { ensureDriveTable } from "../../_lib/google-drive.js";

export async function onRequestGet(context){
  const auth=await requireAdmin(context);
  if(auth.response) return auth.response;
  await ensureDriveTable(context.env.DB);
  const one=await context.env.DB.prepare("SELECT connected_email,folder_id,updated_at FROM google_drive_config WHERE id=1").first();
  const two=await context.env.DB.prepare("SELECT connected_email,folder_id,updated_at FROM google_drive_account_two WHERE id=1").first();
  const accounts=[
    {slot:1,email:one?.connected_email||null,folderReady:!!one?.folder_id,updatedAt:one?.updated_at||null},
    {slot:2,email:two?.connected_email||null,folderReady:!!two?.folder_id,updatedAt:two?.updated_at||null}
  ];
  return json({connected:accounts.some(a=>a.email),accounts,connectedCount:accounts.filter(a=>a.email).length});
}
