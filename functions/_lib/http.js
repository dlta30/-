export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
export function fail(message, status = 400) { return json({ error: message }, status); }
export function newId() { return crypto.randomUUID(); }
