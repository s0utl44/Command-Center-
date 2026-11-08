"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCREENS } from "@/core/screens";

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <nav className="bottom-nav" aria-label="Główna nawigacja">
      {SCREENS.map((screen) => {
        const active = screen.href === "/" ? pathname === "/" : pathname.startsWith(screen.href);
        return (
          <Link key={screen.href} href={screen.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <span aria-hidden="true">{screen.icon}</span>
            <span>{screen.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
