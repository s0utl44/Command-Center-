import { describe, expect, it } from "vitest";
import { resolveAccount, WorkspaceMismatchError } from "@/core/connections";
import { parseProcessDefinition } from "@/core/process";
import { wrePhotoEditV1 } from "@/core/processes/wre-photo-edit";

describe("rozdział kont", () => {
  it("proces WRE dostaje konto WRE", () => {
    expect(resolveAccount(parseProcessDefinition(wrePhotoEditV1)).email).toBe("d.lys@wrenieruchomosci.pl");
  });

  it("proces WRE nie może użyć konta prywatnego", () => {
    const def = parseProcessDefinition({ ...wrePhotoEditV1, connection: { alias: "sotuldrop", services: ["gmail"] } });
    expect(() => resolveAccount(def)).toThrow(WorkspaceMismatchError);
  });

  it("odrzuca konto bez wymaganej usługi", () => {
    const def = parseProcessDefinition({ ...wrePhotoEditV1, connection: { alias: "wre", services: ["hubspot"] } });
    expect(() => resolveAccount(def)).toThrow(/hubspot/);
  });
});
