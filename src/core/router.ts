import type { ParamDef, ProcessDefinition } from "./process";
import { cleanValue, tokens } from "./text";

export interface MissingParam {
  name: string;
  question: string;
  options?: string[];
}

export interface RouteMatch {
  kind: "match";
  process: ProcessDefinition;
  params: Record<string, string>;
  missing: MissingParam[];
}

export type RouteResult =
  | RouteMatch
  | { kind: "ambiguous"; candidates: ProcessDefinition[] }
  | { kind: "no-match" };

/**
 * Router regułowy: proces pasuje, gdy każda grupa słów kluczowych ma trafienie
 * (słowo z wypowiedzi zaczyna się od słowa kluczowego). Więcej niż jeden proces → niejednoznaczność.
 */
export function route(utterance: string, processes: readonly ProcessDefinition[]): RouteResult {
  const words = tokens(utterance);
  const matched = processes.filter((p) =>
    p.intents.keywordGroups.every((group) => group.some((kw) => words.some((w) => w.startsWith(kw)))),
  );
  if (matched.length === 0) return { kind: "no-match" };
  if (matched.length > 1) return { kind: "ambiguous", candidates: matched };
  const process = matched[0] as ProcessDefinition;
  const params = extractParams(utterance, process.params);
  return { kind: "match", process, params, missing: missingParams(process.params, params) };
}

export function extractParams(utterance: string, defs: readonly ParamDef[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (const def of defs) {
    for (const source of def.extract) {
      const value = new RegExp(source, "iu").exec(utterance)?.groups?.value;
      if (value !== undefined && cleanValue(value)) {
        params[def.name] = cleanValue(value);
        break;
      }
    }
  }
  return completeParams(defs, params);
}

/** Uzupełnia wartości domyślne i wyprowadzone. Nie nadpisuje wartości podanych wprost. */
export function completeParams(defs: readonly ParamDef[], given: Readonly<Record<string, string>>): Record<string, string> {
  const params: Record<string, string> = { ...given };
  for (const def of defs) {
    if (params[def.name] !== undefined) continue;
    if (def.derive) {
      const source = params[def.derive.from];
      const rule = source === undefined ? undefined : def.derive.rules.find((r) => new RegExp(r.pattern, "iu").test(source));
      if (rule) {
        params[def.name] = rule.value;
        continue;
      }
    }
    if (def.default !== undefined) params[def.name] = def.default;
  }
  return params;
}

export function missingParams(defs: readonly ParamDef[], params: Readonly<Record<string, string>>): MissingParam[] {
  return defs
    .filter((def) => {
      const value = params[def.name];
      if (!def.required) return false;
      if (value === undefined || value === "") return true;
      return def.options !== undefined && !def.options.includes(value);
    })
    .map((def) => ({ name: def.name, question: def.question, ...(def.options ? { options: def.options } : {}) }));
}
