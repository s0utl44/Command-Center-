import { Placeholder } from "@/components/Placeholder";

export default function TodayPage() {
  return (
    <Placeholder title="Dzisiaj" stage="4">
      <ul className="groups">
        <li>Wykonywane</li>
        <li>Czeka na mnie</li>
        <li>Zaplanowane</li>
        <li>Zakończone</li>
        <li>Problemy</li>
      </ul>
    </Placeholder>
  );
}
