# Mes feuilles Allin

Web app installable (feuilles d'heures, note de frais, fiches d'intervention).

- `index.html` : l'appli (reprise de l'artefact Claude)
- `supabase-shim.js` : connexion, sauvegarde Supabase, IA via le relais, PDF
- `lib/` : les deux bibliothèques utilisées (Supabase 2.119.0 et jsPDF 2.5.1), copiées ici en version fixe
- `sw.js` + `manifest.json` + `icons/` : installation sur l'écran d'accueil et fonctionnement hors ligne
- `supabase/functions/claude/` : relais IA (à déployer dans Supabase, avec le secret `ANTHROPIC_API_KEY`)
- `tests/` + `.github/workflows/tests.yml` : tests automatiques. À chaque modification envoyée sur GitHub, un robot ouvre l'appli avec un faux compte (jamais le vrai) et vérifie : ouverture, saisie d'heures, frais, fiche OT, PDF, saisie hors ligne, et l'IA (lecture d'un ticket, du recto d'une fiche OT, « Mettre au propre », refus ou absence du relais) avec un faux relais : rien ne part vers Anthropic, aucun coût. Coche verte = tout va bien, croix rouge = quelque chose est cassé (détail dans l'onglet « Actions »).

En ligne : https://thirakor.github.io/Mes-feuilles-Allin/
