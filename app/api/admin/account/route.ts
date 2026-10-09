import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/admin/account
// Solo l'admin può modificare l'EMAIL (username) di accesso di un account.
// La password NON è toccabile da qui: resta di default e la cambia l'interessato
// con "Password dimenticata?" nella schermata di login.
// Richiede SUPABASE_SERVICE_ROLE_KEY configurata (resta solo sul server).

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service-role key non configurata sul server (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  // 1) Chi chiama? Deve essere autenticato e con ruolo admin.
  const supa = await createServerSupabase();
  if (!supa) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Operazione riservata al coordinamento." }, { status: 403 });
  }

  // 2) Input e validazione.
  let body: { userId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const userId = (body.userId || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  if (!userId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "UserId o email non validi." }, { status: 400 });
  }

  // 3) Aggiorna l'email di accesso in auth (email_confirm evita che resti "da confermare").
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 4) Tieni allineato profiles.email (usato per mostrare l'account nel menu).
  await admin.from("profiles").update({ email }).eq("id", userId);

  return NextResponse.json({ ok: true, email });
}
