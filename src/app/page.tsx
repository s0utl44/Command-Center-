export default function SpeakPage() {
  return (
    <section className="screen speak">
      <h1 className="sr-only">Mów</h1>
      <p className="muted center">Naciśnij i powiedz, co mam zrobić.</p>
      <button type="button" className="mic" aria-label="Mikrofon (dostępny od etapu 3)" disabled>
        🎙️
      </button>
      <p className="muted center small">Nagrywanie i rozpoznawanie poleceń pojawią się w etapie 3.</p>
    </section>
  );
}
