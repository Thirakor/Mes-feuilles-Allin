/* FAUX SUPABASE POUR LES TESTS
   Remplace la bibliothèque Supabase quand on teste la page de connexion :
   personne n'est connecté, et tout mot de passe est refusé. Rien ne part sur Internet. */
window.supabase = {
  createClient() {
    return {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
        signInWithPassword: async () => ({ error: { message: "Invalid login credentials" } }),
        signUp: async () => ({ data: {}, error: { message: "Signups not allowed for this instance" } }),
        resetPasswordForEmail: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      },
      from() { return {}; },
      functions: { invoke: async () => ({ data: null, error: { message: "non connecté" } }) },
    };
  },
};
