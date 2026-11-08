import { describe, expect, it } from "vitest";
import { parseProcessDefinition, type ActionKind } from "@/core/process";
import { approvalReasons, hasExplicitSend } from "@/core/policy";
import { wrePhotoEditV1 } from "@/core/processes/wre-photo-edit";

function withActions(actions: ActionKind[], writeRequiresApproval = false) {
  return parseProcessDefinition({
    ...wrePhotoEditV1,
    actions,
    approval: { writeRequiresApproval, notes: [] },
  });
}

describe("polityka zgód", () => {
  it("obróbka zdjęć WRE wykonuje się bez pytania", () => {
    expect(approvalReasons(parseProcessDefinition(wrePhotoEditV1), { utterance: "Obrób zdjęcia WS Wola" })).toEqual([]);
  });

  it.each(["Napisz maila do Kowalskiej", "Odpisz Nowakowi, że się zgadzam"])("„%s” wymaga zgody przed wysyłką", (utterance) => {
    expect(approvalReasons(withActions(["draft", "send"]), { utterance })).toEqual(["send-without-explicit-command"]);
  });

  it("„wyślij” zwalnia z dodatkowej zgody na wysyłkę", () => {
    expect(approvalReasons(withActions(["draft", "send"]), { utterance: "Napisz i wyślij maila do Kowalskiej" })).toEqual([]);
  });

  it.each([
    ["delete", "delete"],
    ["publish", "publish"],
    ["payment", "payment"],
    ["irreversible", "irreversible"],
  ] as const)("%s zawsze wymaga zgody", (action, reason) => {
    expect(approvalReasons(withActions(["read", action]), { utterance: "wyślij" })).toContain(reason);
  });

  it("zapis wymaga zgody, gdy tak mówi proces", () => {
    expect(approvalReasons(withActions(["write"], true), { utterance: "x" })).toEqual(["write-requires-approval"]);
  });

  it("niejednoznaczny cel zawsze wymaga zgody", () => {
    expect(approvalReasons(withActions(["read"]), { utterance: "x", ambiguousTarget: true })).toEqual(["ambiguous-target"]);
  });

  it("rozpoznaje formy „wyślij”", () => {
    expect(hasExplicitSend("Wyślij to")).toBe(true);
    expect(hasExplicitSend("wysyłaj")).toBe(true);
    expect(hasExplicitSend("napisz szkic")).toBe(false);
  });
});
