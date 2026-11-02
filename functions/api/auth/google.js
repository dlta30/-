export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const clientId = env.GOOGLE_CLIENT_ID;
  const missing = [!clientId ? "GOOGLE_CLIENT_ID" : null, !env.GOOGLE_CLIENT_SECRET ? "GOOGLE_CLIENT_SECRET" : null].filter(Boolean);
  if (missing.length) {
    return new Response("Google sign-in configuration missing: " + missing.join(", "), { status: 503 });
  }
  const redirectUri = url.origin + "/api/auth/google/callback";
  const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
  const examId = url.searchParams.get("exam") || "";
  const returnCookie = examId && /^[a-zA-Z0-9_-]{1,100}$/.test(examId) ? "; google_exam_return=" + encodeURIComponent(examId) : "";
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    scope: "openid email profile", state, prompt: "select_account"
  });
  const headers = new Headers({ location: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
  headers.append("set-cookie", "google_oauth_state=" + state + "; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
  if (returnCookie) headers.append("set-cookie", returnCookie.slice(2) + "; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
  return new Response(null, { status: 302, headers });
}