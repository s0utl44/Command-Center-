import { z } from "zod";

/**
 * Definicja procesu — zapisana, wersjonowana procedura.
 * Wersje są niezmienne; zmiana procesu = nowa wersja zatwierdzona przez użytkownika.
 */

export const WorkspaceSchema = z.enum(["wre", "private"]);
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ServiceSchema = z.enum(["google-drive", "gmail", "hubspot", "google-calendar", "google-docs", "notion"]);
export type Service = z.infer<typeof ServiceSchema>;

/** Rodzaje działań, które proces może wykonać — podstawa polityki zgód. */
export const ActionKindSchema = z.enum(["read", "draft", "write", "send", "delete", "publish", "payment", "irreversible"]);
export type ActionKind = z.infer<typeof ActionKindSchema>;

export const ExecutionProfileSchema = z.enum(["read-only", "draft-only", "write-with-approval", "write"]);
export type ExecutionProfile = z.infer<typeof ExecutionProfileSchema>;

const RegexSourceSchema = z.string().refine(
  (source) => {
    try {
      new RegExp(source, "iu");
      return true;
    } catch {
      return false;
    }
  },
  { message: "Nieprawidłowe wyrażenie regularne" },
);

export const ParamDefSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  required: z.boolean(),
  default: z.string().optional(),
  /** Pytanie zadawane, gdy parametru brakuje. */
  question: z.string().min(1),
  /** Wzorce wyciągania wartości z wypowiedzi; grupa nazwana `value`. Sprawdzane po kolei. */
  extract: z.array(RegexSourceSchema).default([]),
  /** Wyprowadzenie wartości z innego parametru (np. typ oferty z prefiksu folderu). */
  derive: z
    .object({
      from: z.string(),
      rules: z.array(z.object({ pattern: RegexSourceSchema, value: z.string() })).min(1),
    })
    .optional(),
  /** Dozwolone wartości (jeśli parametr jest wyborem). */
  options: z.array(z.string()).optional(),
});
export type ParamDef = z.infer<typeof ParamDefSchema>;

export const VerificationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file-count-match"),
    description: z.string(),
    sourcePath: z.string(),
    targetPath: z.string(),
  }),
  z.object({
    kind: z.literal("record-readback"),
    description: z.string(),
  }),
]);
export type Verification = z.infer<typeof VerificationSchema>;

export const ProcessDefinitionSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    description: z.string(),
    workspace: WorkspaceSchema,
    connection: z.object({ alias: z.string().min(1), services: z.array(ServiceSchema).min(1) }),
    intents: z.object({
      /** Słowa kluczowe (bez polskich znaków, małymi literami). Każda grupa musi mieć co najmniej jedno trafienie. */
      keywordGroups: z.array(z.array(z.string().min(1)).min(1)).min(1),
      examples: z.array(z.string()).default([]),
    }),
    params: z.array(ParamDefSchema),
    execution: z.object({
      profile: ExecutionProfileSchema,
      /** Skill Hermesa, który wykonuje proces (jeśli istnieje). */
      skill: z.string().optional(),
      /** Instrukcja dla Hermesa; `{{nazwa}}` zastępowane wartością parametru. */
      instruction: z.string().min(1),
    }),
    actions: z.array(ActionKindSchema).min(1),
    approval: z.object({
      /** Czy zwykły zapis (write) wymaga zgody. Usuwanie, publikacja, płatność itp. wymagają jej zawsze. */
      writeRequiresApproval: z.boolean(),
      notes: z.array(z.string()).default([]),
    }),
    verification: VerificationSchema,
    reporting: z.object({
      success: z.string().min(1),
      failure: z.string().min(1),
    }),
  })
  .superRefine((def, ctx) => {
    const names = new Set(def.params.map((p) => p.name));
    if (names.size !== def.params.length) {
      ctx.addIssue({ code: "custom", message: "Zduplikowane nazwy parametrów", path: ["params"] });
    }
    for (const [i, p] of def.params.entries()) {
      if (p.derive && !names.has(p.derive.from)) {
        ctx.addIssue({ code: "custom", message: `Parametr ${p.name} wyprowadzany z nieistniejącego ${p.derive.from}`, path: ["params", i] });
      }
    }
    for (const ref of templateRefs(def.execution.instruction)) {
      if (!names.has(ref)) {
        ctx.addIssue({ code: "custom", message: `Instrukcja odwołuje się do nieznanego parametru {{${ref}}}`, path: ["execution", "instruction"] });
      }
    }
    if (def.execution.profile === "read-only" && def.actions.some((a) => a !== "read")) {
      ctx.addIssue({ code: "custom", message: "Profil read-only dopuszcza tylko działania read", path: ["execution", "profile"] });
    }
    if (def.execution.profile === "draft-only" && def.actions.some((a) => a !== "read" && a !== "draft")) {
      ctx.addIssue({ code: "custom", message: "Profil draft-only dopuszcza tylko read i draft", path: ["execution", "profile"] });
    }
  });

export type ProcessDefinition = z.infer<typeof ProcessDefinitionSchema>;
export type ProcessDefinitionInput = z.input<typeof ProcessDefinitionSchema>;

export function parseProcessDefinition(input: unknown): ProcessDefinition {
  return ProcessDefinitionSchema.parse(input);
}

function templateRefs(template: string): string[] {
  return [...template.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)].map((m) => m[1] as string);
}

/** Wstawia wartości parametrów do szablonu. Brak wartości = błąd (nie wysyłamy niepełnych zleceń). */
export function renderTemplate(template: string, params: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Brak wartości parametru ${name}`);
    return value;
  });
}
