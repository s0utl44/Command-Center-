export function Placeholder({ title, stage, children }: { title: string; stage: string; children?: React.ReactNode }) {
  return (
    <section className="screen">
      <h1>{title}</h1>
      {children}
      <p className="muted">Ten ekran powstanie w etapie {stage}. Nie pokazuje jeszcze żadnych danych.</p>
    </section>
  );
}
