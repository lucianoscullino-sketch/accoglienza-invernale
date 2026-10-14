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
  let body: {
    action?: "create" | "update";
    userId?: string;
    email?: string;
    orgId?: string;
    displayName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email non valida." }, { status: 400 });
  }

  // 2a) action=create: crea il nuovo account di un'associazione.
  //     Nessuna password: l'associazione la imposta da sola con
  //     "Password dimenticata?" nella schermata di login. Il trigger
  //     handle_new_user crea il profilo (role/org_id/display_name/email)
  //     a partire dai metadata.
  if ((body.action || "update") === "create") {
    const orgId = (body.orgId || "").trim();
    const displayName = (body.displayName || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "Associazione non valida." }, { status: 400 });
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { role: "org", org_id: orgId, display_name: displayName },
    });
    if (error) {
      const dup = /already|exists|duplicate/i.test(error.message || "");
      return NextResponse.json(
        { error: dup ? "Esiste già un account con questa email." : error.message },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, userId: data.user.id, email });
  }

  // 2b) action=update: cambia l'email di un account esistente.
  const userId = (body.userId || "").trim();
  if (!userId) {
    return NextResponse.json({ error: "UserId non valido." }, { status: 400 });
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
