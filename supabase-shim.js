/* Remplace les fonctions de l'artefact Claude (window.claude.use) par Supabase :
   - "db"       : tes données, dans ta table Supabase (protégée par ton compte)
   - "user"     : ton compte (connexion e-mail + mot de passe)
   - "sample"   : l'IA (lecture des tickets, mise au propre), via le relais Supabase « claude »
   - "downloads": enregistrement / partage des PDF depuis le téléphone
   Le reste de l'appli est identique à l'artefact. */
(function () {
  const SUPABASE_URL = "https://srvvyorzcarlngoxbdgh.supabase.co";
  const SUPABASE_KEY = "sb_publishable_02EuxUjKLI46PK2p7tno1Q_hlDAt-VT";
  const TABLE = "docs";
  const PASS_MIN = 10; // longueur minimale du mot de passe (à régler aussi dans Supabase)

  /* ---------- copie gardée sur l'appareil ----------
     L'appli garde une copie de tes données sur l'appareil (pour marcher hors ligne).
     On note à quel compte appartient cette copie, pour ne jamais la montrer ni
     l'envoyer à un autre compte, et on l'efface quand tu te déconnectes. */
  const LOCAL_KEYS = ["vallin-feuilles-v1", "vallin-attente-v1", "vallin-secours-v2"];
  const OWNER_KEY = "allin-proprietaire";
  let leaving = false;
  function wipeLocal() {
    try { LOCAL_KEYS.forEach(k => localStorage.removeItem(k)); localStorage.removeItem(OWNER_KEY); } catch (e) {}
  }
  function pendingCount() {
    try { return Object.keys(JSON.parse(localStorage.getItem("vallin-attente-v1") || "{}") || {}).length; } catch (e) { return 0; }
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.sbClient = sb;

  /* ---------- connexion ---------- */
  let resolveSession;
  const sessionReady = new Promise(r => (resolveSession = r));
  let currentUser = null;

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function showLogin(msg) {
    if (document.getElementById("loginGate")) return;
    const gate = el("div", { id: "loginGate" });
    gate.innerHTML = `
      <style>
        #loginGate{position:fixed;inset:0;z-index:9999;background:var(--bg,#f3f4f1);display:flex;align-items:center;justify-content:center;padding:24px;padding-top:calc(24px + env(safe-area-inset-top,0px))}
        #loginGate .lg{width:100%;max-width:380px;background:var(--surface,#fff);border:1px solid var(--line,#d9ddd7);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px;color:var(--ink,#1c211e);font-family:var(--body,system-ui)}
        #loginGate h1{font-family:var(--display,system-ui);font-size:26px;margin:0}
        #loginGate p{margin:0;color:var(--muted,#5f6862);font-size:15px;line-height:1.4}
        #loginGate label{display:flex;flex-direction:column;gap:4px;font-size:14px;font-weight:600}
        #loginGate input{font:inherit;font-size:17px;padding:12px;border:1px solid var(--line,#d9ddd7);border-radius:10px;background:var(--surface,#fff);color:inherit}
        #loginGate button{font:inherit;font-size:17px;font-weight:600;padding:13px;border-radius:12px;border:1px solid var(--line,#d9ddd7);background:var(--surface,#fff);color:inherit}
        #loginGate button.pri{background:var(--green,#2d6a4a);border-color:var(--green,#2d6a4a);color:#fff}
        #loginGate .lnk{border:none;background:none;padding:4px;font-size:15px;font-weight:500;color:var(--green,#2d6a4a);text-decoration:underline}
        #loginGate .msg{min-height:1em;font-size:15px;color:var(--ink,#1c211e)}
      </style>
      <div class="lg">
        <h1>Mes feuilles Allin</h1>
        <p>Connecte-toi pour retrouver tes heures, tes frais et tes fiches sur tous tes appareils.</p>
        <label>Adresse e-mail<input id="lgMail" type="email" inputmode="email" autocomplete="username" autocapitalize="off"></label>
        <label>Mot de passe<input id="lgPass" type="password" autocomplete="current-password"></label>
        <button class="pri" id="lgIn" type="button">Se connecter</button>
        <button id="lgUp" type="button">Créer mon compte</button>
        <button class="lnk" id="lgForgot" type="button">Mot de passe oublié</button>
        <p class="msg" id="lgMsg"></p>
      </div>`;
    document.body.appendChild(gate);
    const $ = id => document.getElementById(id);
    const say = t => { const m = $("lgMsg"); if (m) m.textContent = t || ""; };
    say(msg);
    const creds = () => ({ email: $("lgMail").value.trim(), password: $("lgPass").value });
    const busy = (b, on, txt) => { if (!b || !b.isConnected) return; b.disabled = on; if (txt) b.textContent = txt; };

    $("lgIn").onclick = async () => {
      const c = creds();
      if (!c.email || !c.password) return say("Indique ton e-mail et ton mot de passe.");
      busy($("lgIn"), true, "Connexion…");
      const { error } = await sb.auth.signInWithPassword(c);
      busy($("lgIn"), false, "Se connecter");
      if (error) say(/confirm/i.test(error.message) ? "Confirme d'abord ton adresse : clique sur le lien reçu par e-mail." : "E-mail ou mot de passe incorrect.");
    };
    $("lgUp").onclick = async () => {
      const c = creds();
      if (!c.email || c.password.length < PASS_MIN) return say("Indique ton e-mail et un mot de passe d'au moins " + PASS_MIN + " caractères.");
      busy($("lgUp"), true, "Création…");
      const { data, error } = await sb.auth.signUp({ ...c, options: { emailRedirectTo: location.origin + location.pathname } });
      busy($("lgUp"), false, "Créer mon compte");
      if (error) return say(/not allowed|disabled/i.test(error.message) ? "La création de compte est fermée." : "Création impossible : " + error.message);
      if (!data.session) say("Compte créé ! Ouvre le mail de confirmation, clique sur le lien, puis reviens ici et connecte-toi.");
    };
    $("lgForgot").onclick = async () => {
      const email = $("lgMail").value.trim();
      if (!email) return say("Indique d'abord ton e-mail.");
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      say(error ? "Envoi impossible pour le moment." : "Mail envoyé : suis le lien pour choisir un nouveau mot de passe.");
    };
  }

  function showNewPassword() {
    const p = prompt("Choisis ton nouveau mot de passe (" + PASS_MIN + " caractères minimum) :");
    if (p == null) return;
    if (p.length < PASS_MIN) { alert("Mot de passe trop court : il faut au moins " + PASS_MIN + " caractères."); return setTimeout(showNewPassword, 100); }
    sb.auth.updateUser({ password: p }).then(({ error }) => alert(error ? "Changement impossible." : "Mot de passe changé."));
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") setTimeout(showNewPassword, 300);
    if (session && session.user) {
      // la copie gardée sur l'appareil appartient à un autre compte : on l'efface et on repart à zéro
      let owner = null;
      try { owner = localStorage.getItem(OWNER_KEY); } catch (e) {}
      if (owner && owner !== session.user.id) {
        wipeLocal();
        try { localStorage.setItem(OWNER_KEY, session.user.id); } catch (e) {}
        location.reload();
        return;
      }
      if (!owner) { try { localStorage.setItem(OWNER_KEY, session.user.id); } catch (e) {} }
      const first = !currentUser;
      currentUser = session.user;
      const g = document.getElementById("loginGate");
      if (g) g.remove();
      if (first) resolveSession(session);
      fillAccount();
    } else if (event === "SIGNED_OUT") {
      if (leaving) wipeLocal(); // déconnexion demandée : on ne laisse rien sur l'appareil
      location.reload();
    }
  });

  async function boot() {
    const { data } = await sb.auth.getSession();
    if (!data.session) showLogin();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* ---------- carte « Mon compte » dans le profil ---------- */
  function fillAccount() {
    const t = document.getElementById("accMail");
    if (t && currentUser) t.textContent = currentUser.email || "";
  }
  window.addEventListener("DOMContentLoaded", () => {
    fillAccount();
    const out = document.getElementById("accOut");
    if (out) out.onclick = () => {
      const n = pendingCount();
      const warn = n ? "\n\nAttention : " + n + " saisie" + (n > 1 ? "s ne sont pas encore envoyées" : " n'est pas encore envoyée") + " dans ton compte et " + (n > 1 ? "seront perdues" : "sera perdue") + ". Reconnecte-toi au réseau avant si tu veux " + (n > 1 ? "les" : "la") + " garder." : "";
      if (!confirm("Te déconnecter de cet appareil ? Les données gardées sur cet appareil seront effacées (elles restent dans ton compte)." + warn)) return;
      leaving = true;
      sb.auth.signOut().then(({ error }) => {
        if (error) { leaving = false; alert("Déconnexion impossible pour le moment (pas de réseau ?). Réessaie plus tard."); }
      });
    };
    const imp = document.getElementById("accImport");
    if (imp) imp.onchange = async ev => {
      const f = ev.target.files[0]; ev.target.value = "";
      if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        const docs = o && o.docs ? o.docs : o;
        const ids = Object.keys(docs || {});
        if (!ids.length) throw new Error("vide");
        if (!confirm(`Importer ${ids.length} élément${ids.length > 1 ? "s" : ""} (journées, frais, fiches, profil) ? Les éléments du même jour ou du même OT seront remplacés.`)) return;
        for (const id of ids) await window.put(id, docs[id]);
        if (typeof window.loadDayExtras === "function") window.loadDayExtras();
        alert("Import terminé : " + ids.length + " élément" + (ids.length > 1 ? "s" : "") + ".");
      } catch (e) { alert("Ce fichier n'est pas une sauvegarde valide."); }
    };
  });

  /* ---------- "db" : collection sur la table Supabase ---------- */
  function makeCollection() {
    return {
      doc(id) {
        return {
          async set(data) {
            const { error } = await sb.from(TABLE).upsert(
              { user_id: currentUser.id, id, data, updated_at: new Date().toISOString() },
              { onConflict: "user_id,id" });
            if (error) throw error;
          },
          async delete() {
            const { error } = await sb.from(TABLE).delete().eq("id", id);
            if (error) throw error;
          }
        };
      },
      onSnapshot(cb, onErr) {
        let first = true, busy = false;
        async function pull() {
          if (busy) return; busy = true;
          try {
            const rows = [];
            for (let from = 0; ; from += 1000) {
              const { data, error } = await sb.from(TABLE).select("id,data").range(from, from + 999);
              if (error) throw error;
              rows.push(...data);
              if (data.length < 1000) break;
            }
            cb({ docs: rows.map(r => ({ id: r.id, data: () => r.data })) });
            first = false;
          } catch (e) {
            if (first && onErr) onErr(e);
          } finally { busy = false; }
        }
        pull();
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); });
        window.addEventListener("online", pull);
        setInterval(() => { if (document.visibilityState === "visible") pull(); }, 60000);
        return () => {};
      }
    };
  }

  /* ---------- "sample" : l'IA via le relais Supabase ---------- */
  function blobToB64(b) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); });
  }
  async function callAI(prompt, opts) {
    const images = [];
    for (const b of (opts && opts.images) || []) images.push({ media_type: b.type || "image/jpeg", data: await blobToB64(b) });
    const { data, error } = await sb.functions.invoke("claude", { body: { prompt, images } });
    if (error) {
      const st = error.context && error.context.status;
      const e = new Error("ia"); e.code = st === 429 ? "rate_limited" : st === 403 ? "not_granted" : "failed"; throw e;
    }
    return data || {};
  }
  function makeSampler() {
    const s = async (prompt, opts) => ({ text: (await callAI(prompt, opts)).text || "" });
    s.json = async (prompt, opts) => {
      const r = await callAI(prompt + "\n\nRéponds uniquement avec l'objet JSON, sans aucun texte autour.", opts);
      const t = String(r.text || "");
      const a = t.indexOf("{"), b = t.lastIndexOf("}");
      if (a < 0 || b < a) throw new Error("json");
      return JSON.parse(t.slice(a, b + 1));
    };
    s.limits = async () => ({ images: true });
    return s;
  }
  let samplerP = null;
  function getSampler() {
    if (!samplerP) samplerP = sessionReady.then(async () => {
      try {
        const { data, error } = await sb.functions.invoke("claude", { body: { ping: true } });
        return !error && data && data.ai ? makeSampler() : null;
      } catch (e) { return null; }
    });
    return samplerP;
  }

  /* ---------- "downloads" : PDF ---------- */
  const downloads = {
    async save({ filename, data }) {
      const file = new File([data], filename, { type: data.type || "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return { status: "saved" }; }
        catch (e) { if (e && e.name === "AbortError") { const x = new Error("annulé"); x.code = "cancelled"; throw x; } }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { status: "saved" };
    }
  };

  window.claude = {
    async use(name) {
      if (name === "db") { await sessionReady; return { collection: () => makeCollection() }; }
      if (name === "user") { await sessionReady; return { id: async () => currentUser.id }; }
      if (name === "sample") return getSampler();
      if (name === "downloads") return downloads;
      return null;
    }
  };
})();
