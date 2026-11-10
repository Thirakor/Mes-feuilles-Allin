/* FAUX SUPABASE « CONNECTÉ » POUR LES TESTS DE L'IA
   Remplace la bibliothèque Supabase : un faux compte est déjà connecté, les données restent
   dans la mémoire du robot, et le relais IA « claude » est joué par le test lui-même
   (window.__relais). On teste ainsi le vrai supabase-shim.js, sans Internet,
   sans ta vraie clé et sans dépenser un centime. */
(function () {
  const session = { access_token: "jeton-test", user: { id: "utilisateur-test", email: "test@exemple.fr" } };
  const ok = async fn => { try { await fn(); return { error: null }; } catch (e) { return { error: { message: String(e) } }; } };
  window.supabase = {
    createClient() {
      return {
        auth: {
          getSession: async () => ({ data: { session } }),
          onAuthStateChange(cb) {
            setTimeout(() => cb("INITIAL_SESSION", session), 0);
            return { data: { subscription: { unsubscribe() {} } } };
          },
          signOut: async () => ({ error: null }),
        },
        from() {
          return {
            upsert: row => ok(() => window.__srvSet(row.id, row.data)),
            delete: () => ({ eq: (_col, id) => ok(() => window.__srvDel(id)) }),
            select: () => ({
              range: async (a, b) => {
                try { return { data: (await window.__srvAll()).slice(a, b + 1), error: null }; }
                catch (e) { return { data: null, error: { message: String(e) } }; }
              },
            }),
          };
        },
        functions: {
          async invoke(nom, { body }) {
            window.__appelsIA = (window.__appelsIA || 0) + 1;
            const r = await window.__relais(nom, body);
            if (r.status >= 400) return { data: null, error: { message: "erreur relais", context: { status: r.status } } };
            return { data: r.data, error: null };
          },
        },
      };
    },
  };
})();
