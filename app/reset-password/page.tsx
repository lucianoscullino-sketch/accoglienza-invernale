import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="loginwrap">
      <div className="logincard">
        <h1>Imposta una nuova password</h1>
        <p className="sub">
          Scegli una password nuova per il tuo account. Dopo il aggiornamento potrai accedere
          normalmente dall&apos;accesso.
        </p>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
