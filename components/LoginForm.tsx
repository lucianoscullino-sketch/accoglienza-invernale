"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!supabaseConfigured) {
      setErr(
        "Configurazione mancante: copia .env.example in .env.local e inserisci URL e chiave anonima di Supabase."
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase().auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      } else {
        const { error } = await supabase().auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMsg("Se l'indirizzo esiste, abbiamo inviato una email per reimpostare la password.");
        setMode("login");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Errore nell'accesso";
      setErr(
        m.includes("Invalid login credentials")
          ? "Email o password non corretti."
          : m.includes("Email not confirmed")
            ? "Indirizzo email non confermata: controlla la posta."
            : m
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {err && <p className="err">{err}</p>}
      {msg && <p className="signed">{msg}</p>}
      <div>
        <label className="lb" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="lb" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Attendi…" : mode === "login" ? "Accedi" : "Invia link di ripristino"}
      </button>
      <button
        className="linkbtn"
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "reset" : "login");
          setErr("");
          setMsg("");
        }}
      >
        {mode === "login" ? "Password dimenticata?" : "Torna all'accesso"}
      </button>
      <p className="sub">
        Non hai ancora un&apos;utenza? Chiedi al coordinamento di crearla.
      </p>
    </form>
  );
}
