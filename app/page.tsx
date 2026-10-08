import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import App from "@/components/App";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/login?missing=1");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, org_id, display_name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return (
      <main className="loginwrap">
        <div className="logincard">
          <h1>Account non attivo</h1>
          <p className="sub">
            Esiste un&apos;utenza, ma non è ancora collegata a un&apos;associazione. Chiedi al
            coordinamento di attivare il profilo.
          </p>
        </div>
      </main>
    );
  }

  return <App profile={profile} />;
}
