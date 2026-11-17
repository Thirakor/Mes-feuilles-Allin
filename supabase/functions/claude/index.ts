// Relais IA de « Mes feuilles Allin » (fonction Supabase nommée « claude »).
// Il garde la clé Anthropic secrète : l'appli lui envoie la photo ou le texte,
// il vérifie que c'est bien toi, puis demande à Claude et renvoie la réponse.
// Secrets à créer dans Supabase (Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY  = ta clé de la console Anthropic (obligatoire)
//   OWNER_EMAIL        = ton adresse e-mail (conseillé : personne d'autre ne peut s'en servir)
//   CLAUDE_MODEL       = facultatif, "claude-haiku-5-5" par défaut
// Les espaces et retours à la ligne collés par erreur dans la clé sont enlevés tout seuls,
// et en cas de problème le relais répond une erreur propre au lieu de planter.

// clé publique de l'appli (pas secrète, la même que dans supabase-shim.js)
const PUBLISHABLE = "sb_publishable_02EuxUjKLI46PK2p7tno1Q_hlDAt-VT";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// masque une éventuelle clé dans un message d'erreur avant de l'écrire dans les logs
const masque = (m: string) => m.replace(/sk-ant-[\w\-\s]+/g, "sk-ant-…(masquée)");

Deno.serve(async (req) => {
  try {
    return await relais(req);
  } catch (e) {
    // quoi qu'il arrive, on répond proprement à l'appli au lieu de planter
    console.error("relais :", masque(String((e as Error)?.stack || e)));
    return json({ error: "relais" }, 500);
  }
});

async function relais(req: Request): Promise<Response> {
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

  // on enlève espaces et retours à la ligne collés par erreur autour ou dans la clé
  const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").replace(/\s+/g, "");
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
  const model = (Deno.env.get("CLAUDE_MODEL") || "").trim() || "claude-haiku-5-5";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    }),
  });
  if (r.status === 429) return json({ error: "trop de demandes" }, 429);
  if (!r.ok) return json({ error: "ia", detail: (await r.text()).slice(0, 300) }, 502);
  const out = await r.json();
  const text = (out.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return json({ text });
}
