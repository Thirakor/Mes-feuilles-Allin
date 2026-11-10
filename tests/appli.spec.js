// Tests automatiques de « Mes feuilles Allin ».
// Chaque test ouvre l'appli comme toi sur ton téléphone, avec un faux compte et de fausses données.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const ADRESSE = "http://appli.test/";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

// Ouvre l'appli. « compte » joue le rôle de Supabase : une simple liste en mémoire.
// « relais » (facultatif) : faux relais IA. Avec lui, l'appli utilise le vrai supabase-shim.js
// branché sur un faux Supabase connecté ; le relais reçoit ce que l'appli enverrait à Claude.
async function ouvrir(page, compte, { pageDeConnexion = false, relais = null } = {}) {
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  await page.clock.setFixedTime(new Date("2026-03-10T09:00:00+01:00")); // toujours le mardi 10 mars 2026
  await page.exposeFunction("__srvSet", (id, data) => { if (compte.coupe) throw new Error("réseau coupé"); compte.docs.set(id, data); });
  await page.exposeFunction("__srvDel", id => { if (compte.coupe) throw new Error("réseau coupé"); compte.docs.delete(id); });
  await page.exposeFunction("__srvAll", () => [...compte.docs].map(([id, data]) => ({ id, data })));
  if (relais) await page.exposeFunction("__relais", (nom, body) => relais(nom, body));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin + "/" !== ADRESSE) return route.abort(); // rien ne sort vers Internet
    let f = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    if (pageDeConnexion) { if (f.startsWith("lib/supabase-")) f = "tests/faux-supabase.js"; } // vrai fichier de connexion, faux Supabase
    else if (relais) { if (f.startsWith("lib/supabase-")) f = "tests/faux-supabase-connecte.js"; } // vrai fichier de liaison, faux Supabase + faux relais IA
    else if (f === "supabase-shim.js") f = "tests/faux-compte.js";
    const fichier = path.join(RACINE, f);
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ body: fs.readFileSync(fichier), contentType: TYPES[path.extname(fichier)] || "application/octet-stream" });
  });
  await page.goto(ADRESSE);
  if (!pageDeConnexion) await expect(page.locator("#syncInfo")).toContainText("Enregistré dans ton compte");
  return erreurs;
}
const nouveauCompte = () => ({ docs: new Map(), coupe: false });

// Les boutons « Télécharger le PDF » sont cachés (la barre du bas les remplace) : on les déclenche directement.
const telecharger = (page, id) => page.evaluate(i => document.getElementById(i).click(), id);

async function saisirIntervention(page, client) {
  await page.click("#addTask");
  await page.selectOption("#tStart", "08:00");
  await page.selectOption("#tEnd", "10:00");
  await page.fill("#tOt", "62618");
  await page.fill("#tClient", client);
  await page.click("#tSave");
}

test("l'appli s'ouvre sans erreur", async ({ page }) => {
  const erreurs = await ouvrir(page, nouveauCompte());
  await expect(page.locator("#vHeures")).toBeVisible();
  for (const onglet of ["#tabF", "#tabO", "#btnProfil", "#tabH"]) await page.click(onglet);
  expect(erreurs).toEqual([]);
});

test("connexion : la page s'affiche avec le logo, et refuse un mauvais mot de passe", async ({ page }) => {
  const erreurs = await ouvrir(page, nouveauCompte(), { pageDeConnexion: true });
  const porte = page.locator("#loginGate");
  await expect(porte).toBeVisible();
  await expect(porte.locator("h1")).toHaveText("Bonjour,");
  await expect(porte).toContainText("tes heures, tes frais et tes OT");
  await expect(porte).toContainText("Allin · Groupe Hisma");
  expect(await porte.locator(".logo img").evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
  const carte = await porte.locator(".lg").boundingBox(); // la carte blanche garde une marge de chaque côté de l'écran
  expect(carte.x).toBeGreaterThanOrEqual(16);
  expect(carte.x + carte.width).toBeLessThanOrEqual(390 - 16);
  for (const b of ["#lgIn", "#lgUp", "#lgForgot"]) await expect(page.locator(b)).toBeVisible();
  await page.click("#lgIn"); // rien de rempli
  await expect(page.locator("#lgMsg")).toContainText("Indique ton e-mail");
  await page.fill("#lgMail", "test@exemple.fr");
  await page.fill("#lgPass", "mauvais-mot-de-passe");
  await page.click("#lgIn");
  await expect(page.locator("#lgMsg")).toContainText("incorrect");
  await page.click("#lgUp");
  await expect(page.locator("#lgMsg")).toContainText("création de compte est fermée");
  expect(erreurs).toEqual([]);
});

test("profil : les deux cases de la pause midi sont alignées", async ({ page }) => {
  await ouvrir(page, nouveauCompte());
  await page.click("#btnProfil");
  const debut = await page.locator("#pMidiS").boundingBox();
  const fin = await page.locator("#pMidiE").boundingBox();
  expect(Math.abs(debut.y - fin.y)).toBeLessThan(1);
  expect(Math.abs(debut.height - fin.height)).toBeLessThan(1);
});

test("heures : une intervention saisie est enregistrée et retrouvée", async ({ page }) => {
  const compte = nouveauCompte();
  await ouvrir(page, compte);
  await saisirIntervention(page, "GAEC DU TEST");
  await expect(page.locator("#tasks")).toContainText("GAEC DU TEST");
  await expect(page.locator("#dTotal")).toContainText("2h");
  const jour = compte.docs.get("j_2026-03-10");
  expect(jour.tasks).toHaveLength(1);
  expect(jour.tasks[0]).toMatchObject({ start: "08:00", end: "10:00", ot: "62618", client: "GAEC DU TEST" });
  await page.reload(); // on ferme et on rouvre l'appli
  await expect(page.locator("#tasks")).toContainText("GAEC DU TEST");
});

test("heures : une fin avant le début est refusée", async ({ page }) => {
  const compte = nouveauCompte();
  await ouvrir(page, compte);
  await page.click("#addTask");
  await page.selectOption("#tStart", "10:00");
  await page.selectOption("#tEnd", "09:00");
  await page.click("#tSave");
  await expect(page.locator("#tErr")).toBeVisible();
  expect(compte.docs.size).toBe(0);
});

test("frais : un repas saisi à la main est enregistré, et plafonné à 15 € dans le total", async ({ page }) => {
  const compte = nouveauCompte();
  await ouvrir(page, compte);
  await page.click("#tabF");
  await page.click("#addManual");
  await page.fill("#eTtc", "23,50");
  await page.fill("#eTva", "2,14");
  await page.click("#eSave");
  await expect(page.locator("#expList")).toContainText("23,50");
  await expect(page.locator("#sTot")).toContainText("15,00"); // règle Allin : repas plafonné à 15 € par jour
  const frais = [...compte.docs].filter(([id]) => id.startsWith("f_")).map(([, d]) => d);
  expect(frais).toHaveLength(1);
  expect(frais[0]).toMatchObject({ date: "2026-03-10", cat: "repas", ttc: 23.5, tva: 2.14 });
});

test("OT : une fiche créée est enregistrée et apparaît dans la liste", async ({ page }) => {
  const compte = nouveauCompte();
  await ouvrir(page, compte);
  await page.click("#tabO");
  await page.fill("#otNew", "62618");
  await page.click("#otNewBtn");
  await expect(page.locator("#otTitle")).toContainText("62618");
  await page.fill("#oClient", "GAEC DU TEST");
  await page.fill("#oPanne", "Fuite hydraulique");
  await page.click("#otBack");
  await page.click("#fcT"); // filtre « toutes »
  await expect(page.locator("#otList")).toContainText("62618");
  expect(compte.docs.get("ot_62618")).toMatchObject({ client: "GAEC DU TEST", panne: "Fuite hydraulique" });
});

test("PDF : feuilles de la semaine, note de frais et fiche OT sont produites", async ({ page }) => {
  await ouvrir(page, nouveauCompte());
  await saisirIntervention(page, "GAEC DU TEST");
  await telecharger(page, "wPdf");
  await page.click("#tabF");
  await page.click("#addForfait");
  await page.click("#eSave");
  await telecharger(page, "mPdf");
  await page.click("#tabO");
  await page.fill("#otNew", "62618");
  await page.click("#otNewBtn");
  await telecharger(page, "oPdf");
  await expect.poll(() => page.evaluate(() => window.__pdfs.length)).toBe(3);
  const pdfs = await page.evaluate(() => window.__pdfs);
  expect(pdfs[0].filename).toBe("Heures_S11_2026.pdf");
  expect(pdfs[1].filename).toBe("Note_de_frais_03_2026.pdf");
  expect(pdfs[2].filename).toContain("62618");
  for (const p of pdfs) { expect(p.debut).toBe("%PDF"); expect(p.taille).toBeGreaterThan(2000); }
});

test("hors ligne : la saisie attend sur le téléphone puis part au retour du réseau", async ({ page }) => {
  const compte = nouveauCompte();
  await ouvrir(page, compte);
  compte.coupe = true; // plus de réseau
  await saisirIntervention(page, "CLIENT SANS RESEAU");
  await expect(page.locator("#tasks")).toContainText("CLIENT SANS RESEAU");
  await expect(page.locator("#syncInfo")).toContainText("1 saisie en attente");
  expect(compte.docs.size).toBe(0);
  compte.coupe = false; // le réseau revient
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#syncInfo")).toContainText("Enregistré dans ton compte");
  expect(compte.docs.get("j_2026-03-10").tasks[0].client).toBe("CLIENT SANS RESEAU");
});

test("installation : tous les fichiers gardés hors ligne existent bien", () => {
  const sw = fs.readFileSync(path.join(RACINE, "sw.js"), "utf8");
  const liste = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\]);/)[1]);
  for (const f of liste) expect(fs.existsSync(path.join(RACINE, f === "./" ? "index.html" : f)), f).toBe(true);
  const page = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");
  for (const m of page.matchAll(/<script src="([^"]+)"/g)) expect(fs.existsSync(path.join(RACINE, m[1])), m[1]).toBe(true);
});

/* ---------- IA (lecture des tickets, des fiches OT, mise au propre) ----------
   Un faux relais IA répond à la place de Claude : on vérifie ce que l'appli envoie
   et ce qu'elle fait de la réponse. Rien ne part vers Anthropic. */
const PHOTO = path.join(RACINE, "icons", "icon-192.png"); // n'importe quelle image fait l'affaire

// Crée un faux relais. « repondre(body) » donne la réponse de « Claude » ; tout est noté dans « appels ».
function fauxRelais(repondre, { cle = true } = {}) {
  const appels = [];
  const relais = (nom, body) => {
    if (nom !== "claude") return { status: 404 };
    if (body.ping) return { status: 200, data: { ok: true, ai: cle } };
    appels.push(body);
    return repondre(body);
  };
  return { relais, appels };
}

test("IA : un ticket photographié remplit la date, le montant, la TVA et le type", async ({ page }) => {
  const compte = nouveauCompte();
  const { relais, appels } = fauxRelais(() => ({ status: 200, data: {
    text: 'Voici :\n```json\n{"date":"2026-03-08","total_ttc":61.2,"tva":10.2,"categorie":"carburant","commerce":"Total Niort"}\n```' } }));
  const erreurs = await ouvrir(page, compte, { relais });
  await page.click("#tabF");
  await expect(page.locator("#scanHint")).toBeHidden(); // la lecture automatique est disponible
  await page.setInputFiles("#scanInput", PHOTO);
  await expect(page.locator("#eStatus")).toContainText("Total Niort");
  await expect(page.locator("#eDate")).toHaveValue("2026-03-08");
  await expect(page.locator("#eCat")).toHaveValue("carburant");
  await expect(page.locator("#eTtc")).toHaveValue("61,2");
  await expect(page.locator("#eTva")).toHaveValue("10,2");
  // ce qui part vers le relais : une seule photo, réduite en JPEG, et la consigne de lecture
  expect(appels).toHaveLength(1);
  expect(appels[0].images).toHaveLength(1);
  expect(appels[0].images[0].media_type).toBe("image/jpeg");
  expect(appels[0].images[0].data.length).toBeGreaterThan(100);
  expect(appels[0].prompt).toContain("ticket de caisse");
  await page.click("#eSave");
  await expect.poll(() => [...compte.docs.keys()].filter(id => id.startsWith("f_")).length).toBe(1);
  const frais = [...compte.docs].find(([id]) => id.startsWith("f_"))[1];
  expect(frais).toMatchObject({ date: "2026-03-08", cat: "carburant", ttc: 61.2, tva: 10.2 });
  expect(erreurs).toEqual([]);
});

test("IA : si le relais refuse, on peut toujours saisir le ticket à la main", async ({ page }) => {
  const { relais } = fauxRelais(() => ({ status: 403 }));
  await ouvrir(page, nouveauCompte(), { relais });
  await page.click("#tabF");
  await page.setInputFiles("#scanInput", PHOTO);
  await expect(page.locator("#eStatus")).toContainText("refusée");
  await expect(page.locator("#eSave")).toBeEnabled();
});

test("IA : une réponse illisible de Claude ne bloque pas la saisie", async ({ page }) => {
  const { relais } = fauxRelais(() => ({ status: 200, data: { text: "Désolé, je ne vois pas de ticket." } }));
  await ouvrir(page, nouveauCompte(), { relais });
  await page.click("#tabF");
  await page.setInputFiles("#scanInput", PHOTO);
  await expect(page.locator("#eStatus")).toContainText("illisible");
  await expect(page.locator("#eSave")).toBeEnabled();
});

test("IA : sans clé Anthropic dans Supabase, l'appli prévient que la lecture est indisponible", async ({ page }) => {
  const { relais, appels } = fauxRelais(() => ({ status: 503 }), { cle: false });
  await ouvrir(page, nouveauCompte(), { relais });
  await page.click("#tabF");
  await expect(page.locator("#scanHint")).toBeVisible();
  await expect(page.locator("#scanHint")).toContainText("pas disponible");
  expect(appels).toHaveLength(0);
});

test("IA : la photo du recto d'une fiche OT crée la fiche avec le client et la panne", async ({ page }) => {
  const compte = nouveauCompte();
  const { relais, appels } = fauxRelais(() => ({ status: 200, data: { text: JSON.stringify({
    ot: "CZ00062618", client: "EARL BOBINET", materiel: "Tracteur Valtra", type: "N104H5", serie: "HV123",
    compteur: "5367 h", immat: null, annee: null, garantie: true, travaux_demandes: ["Fuite hydraulique F", "Vidange"] }) } }));
  await ouvrir(page, compte, { relais });
  await page.click("#tabO");
  await page.setInputFiles("#otScan", PHOTO);
  await expect(page.locator("#otTitle")).toContainText("62618");
  await expect(page.locator("#oClient")).toHaveValue("EARL BOBINET");
  await expect(page.locator("#oPanne")).toHaveValue("Fuite hydraulique\nVidange"); // le « F » de la marge est retiré
  expect(appels[0].prompt).toContain("FICHE INTERVENTION CLIENT");
  await page.click("#otBack");
  await expect.poll(() => compte.docs.get("ot_62618")?.client).toBe("EARL BOBINET");
});

test("IA : « Mettre au propre » réécrit les notes, et « Revenir à mes notes » les rend", async ({ page }) => {
  const { relais, appels } = fauxRelais(() => ({ status: 200, data: { text: "Fuite constatée sur le flexible hydraulique du relevage arrière." } }));
  await ouvrir(page, nouveauCompte(), { relais });
  await page.click("#tabO");
  await page.fill("#otNew", "62618");
  await page.click("#otNewBtn");
  await page.fill("#oPanne", "fuite flexible relevage ar");
  const bouton = page.locator('[data-ai="oPanne"]');
  await bouton.click();
  await expect(page.locator("#oPanne")).toHaveValue("Fuite constatée sur le flexible hydraulique du relevage arrière.");
  await expect(bouton).toHaveText("Revenir à mes notes");
  expect(appels[0].prompt).toContain("fuite flexible relevage ar");
  expect(appels[0].images || []).toHaveLength(0);
  await bouton.click();
  await expect(page.locator("#oPanne")).toHaveValue("fuite flexible relevage ar");
});
