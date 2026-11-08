import { authConfig } from "@/server/auth/config";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  konto: "To konto nie ma dostępu do Broskiego.",
  anulowano: "Logowanie zostało przerwane.",
  stan: "Sesja logowania wygasła — spróbuj jeszcze raz.",
  google: "Google nie potwierdził logowania — spróbuj jeszcze raz.",
  siec: "Brak połączenia z Google — spróbuj jeszcze raz.",
  token: "Nie udało się potwierdzić tożsamości.",
  tryb: "Logowanie przez Google nie jest włączone.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ blad?: string }> }) {
  const { blad } = await searchParams;
  const cfg = authConfig();
  return (
    <section className="screen login">
      <h1>Broski</h1>
      <p className="muted">Twój ziomek do zadań specjalnych.</p>
      {blad && (
        <p className="error" role="alert">
          {ERRORS[blad] ?? "Nie udało się zalogować."}
        </p>
      )}
      <form action="/api/auth/login" method="get">
        <button type="submit" className="primary">
          {cfg.mode === "dev" ? "Zaloguj (tryb testowy, bez Google)" : "Zaloguj przez Google"}
        </button>
      </form>
      {cfg.mode === "dev" && <p className="sim-banner">Tryb testowy logowania — tylko do rozwoju, nigdy z prawdziwym Hermesem.</p>}
    </section>
  );
}
