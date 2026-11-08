/** Normalizacja tekstu do dopasowań: małe litery, bez polskich znaków, pojedyncze spacje. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tokens(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

/** Czyści wyciągniętą wartość z cudzysłowów i końcowej interpunkcji. */
export function cleanValue(value: string): string {
  return value
    .trim()
    .replace(/^[„"'“«]+|[”"'«»]+$/g, "")
    .replace(/[\s,.;:!?]+$/g, "")
    .trim();
}
