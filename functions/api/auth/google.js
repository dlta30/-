export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId || !env.GOOGLE_CLIENT_SECRET) {
    return new Response("Google sign-in is not configured", { status: 503 });
  }
  const redirectUri = url.origin + "/api/auth/google/callback";
  const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    scope: "openid email profile", state, prompt: "select_account"
  });
  return new Response(null, { status: 302, headers: {
    location: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString(),
    "set-cookie": "google_oauth_state=" + state + "; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600"
  }});
}