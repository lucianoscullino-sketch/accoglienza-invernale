"use client";

// Pagina di reset password: apre la sessione di recupero dal link ricevuto via
// email e poi lascia impostare la nuova password con auth.updateUser.
// Accetta due tipi di link:
//  - ?hash=<token_hash>  (template email custom con {{ .TokenHash }}): funziona
//    su qualsiasi browser/dispositivo, perché il token è autosufficiente;
//  - ?code=...           (PKCE, link di default di Supabase): lo scambio richiede
//    il code_verifier salvato nello storage, quindi SOLO nello stesso browser
//    in cui il link è stato richiesto ("PKCE code verifier not found" se no).
// È l'unico modo per cambiare password: senza questa pagina il link "Password
// dimenticata?" non portava a nulla.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(!supabaseConfigured);
  const [sessionOk, setSessionOk] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(
    supabaseConfigured ? "" : "Configurazione Supabase mancante: controlla .env.local."
  );
  const [busy, setBusy] = useState(false);

  // Apre la sessione di recupero dal link (?hash= token, oppure ?code= PKCE).
  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("hash");
      try {
        if (tokenHash) {
          // Token hash: validabile ovunque, senza storage di mezzo.
          const { error } = await supabase().auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else if (code) {
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
        const m = e instanceof Error ? e.message : "";
        setErr(
          m.toLowerCase().includes("code verifier") || m.toLowerCase().includes("pkce")
            ? "Questo link è stato aperto in un browser o dispositivo diverso da quello da cui l'hai richiesto. Torna all'accesso, richiedi un nuovo link e aprilo subito nello stesso browser."
            : m || "Link di ripristino non valido."
        );
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
