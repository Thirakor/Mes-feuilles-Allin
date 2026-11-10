/* FAUX COMPTE POUR LES TESTS
   Pendant les tests, ce fichier remplace supabase-shim.js : l'appli croit parler à Supabase,
   mais tout reste dans la mémoire du robot. Ton vrai compte n'est jamais touché. */
(function () {
  const collection = {
    doc(id) {
      return {
        set: data => window.__srvSet(id, data),   // lève une erreur si le « réseau » est coupé
        delete: () => window.__srvDel(id),
      };
    },
    onSnapshot(cb, onErr) {
      window.__srvAll().then(
        rows => cb({ docs: rows.map(r => ({ id: r.id, data: () => r.data })) }),
        e => onErr && onErr(e));
      return () => {};
    },
  };
  window.__pdfs = [];
  const downloads = {
    async save({ filename, data }) {
      const debut = new TextDecoder().decode(new Uint8Array(await data.slice(0, 4).arrayBuffer()));
      window.__pdfs.push({ filename, taille: data.size, debut });
      return { status: "saved" };
    },
  };
  window.claude = {
    async use(name) {
      if (name === "db") return { collection: () => collection };
      if (name === "user") return { id: async () => "utilisateur-test" };
      if (name === "sample") return null; // pas d'IA pendant les tests
      if (name === "downloads") return downloads;
      return null;
    },
  };
})();
