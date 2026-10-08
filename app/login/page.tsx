import LoginForm from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="loginwrap">
      <div className="logincard">
        <h1>Accoglienza Invernale</h1>
        <p className="sub">
          Accedi con l&apos;utenza della tua associazione per consultare la mappa e registrare
          gli esiti delle uscite.
        </p>
        {sp.missing ? (
          <p className="err">
            Configurazione Supabase mancante: copia <code>.env.example</code> in{" "}
            <code>.env.local</code> e inserisci URL e chiave anonima del tuo progetto.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
