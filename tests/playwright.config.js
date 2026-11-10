// Réglages du robot de test : il ouvre l'appli dans un faux téléphone.
const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: ".",
  timeout: 30000,
  reporter: [["list"]],
  use: {
    viewport: { width: 390, height: 844 }, // taille d'un iPhone
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    serviceWorkers: "block", // pas de copie « hors ligne » pendant les tests : on teste toujours le code actuel
  },
});
