# Mes feuilles Allin

Web app installable (feuilles d'heures, note de frais, fiches d'intervention).

- `index.html` : l'appli (reprise de l'artefact Claude)
- `supabase-shim.js` : connexion, sauvegarde Supabase, IA via le relais, PDF
- `sw.js` + `manifest.json` + `icons/` : installation sur l'écran d'accueil et fonctionnement hors ligne
- `supabase/functions/claude/` : relais IA (à déployer dans Supabase, avec le secret `ANTHROPIC_API_KEY`)

En ligne : https://thirakor.github.io/Mes-feuilles-Allin/
