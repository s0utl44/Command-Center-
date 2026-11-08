import type { ActionKind, ProcessDefinition } from "./process";
import { normalize } from "./text";

export type ApprovalReason =
  | "send-without-explicit-command"
  | "publish"
  | "delete"
  | "payment"
  | "irreversible"
  | "write-requires-approval"
  | "ambiguous-target";

export interface ApprovalContext {
  /** Wypowiedź użytkownika — szukamy w niej wyraźnego polecenia „wyślij”. */
  utterance: string;
  /** Kontakt/folder/odbiorca nie jest jednoznaczny. */
  ambiguousTarget?: boolean;
}

const ALWAYS_APPROVE: Partial<Record<ActionKind, ApprovalReason>> = {
  publish: "publish",
  delete: "delete",
  payment: "payment",
  irreversible: "irreversible",
};

/** „wyślij”, „wysyłaj”, „wyślijcie” — ale nie „napisz” ani „odpisz”. */
export function hasExplicitSend(utterance: string): boolean {
  return normalize(utterance)
    .split(" ")
    .some((w) => w.startsWith("wysl") || w.startsWith("wysyl"));
}

/**
 * Deterministyczna polityka zgód. Pusta lista = można wykonać bez pytania.
 * Decyduje kod, nie model.
 */
export function approvalReasons(process: ProcessDefinition, ctx: ApprovalContext): ApprovalReason[] {
  const reasons = new Set<ApprovalReason>();
  for (const action of process.actions) {
    const always = ALWAYS_APPROVE[action];
    if (always) reasons.add(always);
    if (action === "send" && !hasExplicitSend(ctx.utterance)) reasons.add("send-without-explicit-command");
    if (action === "write" && process.approval.writeRequiresApproval) reasons.add("write-requires-approval");
  }
  if (ctx.ambiguousTarget) reasons.add("ambiguous-target");
  return [...reasons];
}

export const APPROVAL_REASON_LABEL: Record<ApprovalReason, string> = {
  "send-without-explicit-command": "Wysyłka — nie padło polecenie „wyślij”",
  publish: "Publikacja",
  delete: "Usuwanie danych",
  payment: "Płatność",
  irreversible: "Nieodwracalna zmiana",
  "write-requires-approval": "Zapis w systemie zewnętrznym",
  "ambiguous-target": "Niejednoznaczny cel działania",
};
