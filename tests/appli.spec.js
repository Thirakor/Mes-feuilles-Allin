// Tests automatiques de « Mes feuilles Allin ».
// Chaque test ouvre l'appli comme toi sur ton téléphone, avec un faux compte et de fausses données.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const ADRESSE = "http://appli.test/";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

// Ouvre l'appli. « compte » joue le rôle de Supabase : une simple liste en mémoire.
async function ouvrir(page, compte) {
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  await page.clock.setFixedTime(new Date("2026-03-10T09:00:00+01:00")); // toujours le mardi 10 mars 2026
  await page.exposeFunction("__srvSet", (id, data) => { if (compte.coupe) throw new Error("réseau coupé"); compte.docs.set(id, data); });
  await page.exposeFunction("__srvDel", id => { if (compte.coupe) throw new Error("réseau coupé"); compte.docs.delete(id); });
  await page.exposeFunction("__srvAll", () => [...compte.docs].map(([id, data]) => ({ id, data })));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin + "/" !== ADRESSE) return route.abort(); // rien ne sort vers Internet
    let f = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    if (f === "supabase-shim.js") f = "tests/faux-compte.js";
    const fichier = path.join(RACINE, f);
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ body: fs.readFileSync(fichier), contentType: TYPES[path.extname(fichier)] || "application/octet-stream" });
  });
  await page.goto(ADRESSE);
  await expect(page.locator("#syncInfo")).toContainText("Enregistré dans ton compte");
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
