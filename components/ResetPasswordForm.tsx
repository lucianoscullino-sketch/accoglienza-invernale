"use client";

// Pagina di reset password: apre la sessione di recupero dal link ricevuto via
// email (Supabase rimanda qui con ?code= in PKCE oppure #access_token= in
// implicita) e poi lascia impostare la nuova password con auth.updateUser.
// È l'unico modo per cambiare password: senza questa pagina il link "Password
// dimenticata?" non portava a nulla.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionOk, setSessionOk] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Apre la sessione di recupero dal link (PKCE ?code= oppure #access_token=).
  useEffect(() => {
    if (!supabaseConfigured) {
      setErr("Configurazione Supabase mancante: controlla .env.local.");
      setReady(true);
      return;
    }
    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      try {
        if (code) {
          const { error } = await supabase().auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // In modalità implicita il client archivia già la sessione dal fragment.
        const { data } = await supabase().auth.getSession();
        if (data.session) {
          setSessionOk(true);
        } else {
          setErr(
            "Il link di ripristino non è valido o è scaduto. Torna al login e richiedine uno nuovo."
          );
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Link di ripristino non valido.");
      } finally {
        // Ripulisce l'URL per non lasciare in giro il token/referral.
        window.history.replaceState({}, "", window.location.pathname);
        setReady(true);
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (password.length < 6) {
      setErr("La password deve avere almeno 6 caratteri.");
      return;
    }
    if (password !== confirm) {
      setErr("Le due password non coincidono.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) throw error;
      setMsg("Password aggiornata. Ora puoi accedere con la nuova password.");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Impossibile aggiornare la password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {err && <p className="err">{err}</p>}
      {msg && <p className="signed">{msg}</p>}
      {!ready && <p className="sub">Verifica del link di ripristino…</p>}
      {ready && !sessionOk && !err && <p className="sub">Preparazione in corso…</p>}
      {ready && sessionOk ? (
        <>
          <div>
            <label className="lb" htmlFor="new-password">
              Nuova password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="lb" htmlFor="confirm-password">
              Conferma password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Attendi…" : "Aggiorna password"}
          </button>
        </>
      ) : null}
    </form>
  );
}
