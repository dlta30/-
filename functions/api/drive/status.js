import { requireAdmin } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { ensureDriveTable } from "../../_lib/google-drive.js";
export async function onRequestGet(context){
  const auth=await requireAdmin(context);
  if(auth.response) return auth.response;
  await ensureDriveTable(context.env.DB);
  const row=await context.env.DB.prepare("SELECT connected_email,folder_id,updated_at FROM google_drive_config WHERE id=1").first();
  return json({connected:!!row, email:row?.connected_email||null, folderReady:!!row?.folder_id, updatedAt:row?.updated_at||null});
}
