// Relais IA de « Mes feuilles Allin » (fonction Supabase nommée « claude »).
// Il garde la clé Anthropic secrète : l'appli lui envoie la photo ou le texte,
// il vérifie que c'est bien toi, puis demande à Claude et renvoie la réponse.
// Secrets à créer dans Supabase (Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY  = ta clé de la console Anthropic (obligatoire)
//   OWNER_EMAIL        = ton adresse e-mail (conseillé : personne d'autre ne peut s'en servir)
//   CLAUDE_MODEL       = facultatif, "claude-haiku-5-5" par défaut

// clé publique de l'appli (pas secrète, la même que dans supabase-shim.js)
const PUBLISHABLE = "sb_publishable_02EuxUjKLI46PK2p7tno1Q_hlDAt-VT";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // qui appelle ? (jeton de connexion de l'appli)
  const auth = req.headers.get("Authorization") || "";
  const userRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") || PUBLISHABLE },
  });
  if (!userRes.ok) return json({ error: "non connecté" }, 401);
  const user = await userRes.json();
  const owner = (Deno.env.get("OWNER_EMAIL") || "").trim().toLowerCase();
  if (owner && String(user.email || "").toLowerCase() !== owner) return json({ error: "refusé" }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  let body: { ping?: boolean; prompt?: string; images?: { media_type: string; data: string }[] } = {};
  try { body = await req.json(); } catch { return json({ error: "requête" }, 400); }
  if (body.ping) return json({ ok: true, ai: !!key });
  if (!key) return json({ error: "clé manquante" }, 503);

  const prompt = String(body.prompt || "").slice(0, 20000);
  const images = (body.images || []).slice(0, 3);
  if (!prompt) return json({ error: "vide" }, 400);

  const content = [
    ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type || "image/jpeg", data: im.data } })),
    { type: "text", text: prompt },
  ];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("CLAUDE_MODEL") || "claude-haiku-5-5",
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    }),
  });
  if (r.status === 429) return json({ error: "trop de demandes" }, 429);
  if (!r.ok) return json({ error: "ia", detail: (await r.text()).slice(0, 300) }, 502);
  const out = await r.json();
  const text = (out.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return json({ text });
});
