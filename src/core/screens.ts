export interface Screen {
  href: string;
  label: string;
  icon: string;
}

/** Główne ekrany aplikacji, w kolejności dolnej nawigacji. „Mów” jest ekranem startowym. */
export const SCREENS: readonly Screen[] = [
  { href: "/", label: "Mów", icon: "🎙️" },
  { href: "/dzisiaj", label: "Dzisiaj", icon: "📋" },
  { href: "/procesy", label: "Procesy", icon: "⚙️" },
  { href: "/polaczenia", label: "Połączenia", icon: "🔌" },
];
