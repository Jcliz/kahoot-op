import { describe, expect, it } from "vitest";
import { cleanNickname, isBlockedNickname, nicknameKey, validateNickname } from "./nickname";

describe("nicknameKey", () => {
  it("ignora acentos, maiúsculas e espaços extras", () => {
    expect(nicknameKey("  Zé   da OBRA ")).toBe("ze da obra");
    expect(nicknameKey("JOÃOZINHO")).toBe(nicknameKey("joaozinho"));
  });
});

describe("cleanNickname", () => {
  it("remove caracteres de controle e invisíveis", () => {
    expect(cleanNickname("Ana​\u0007 Paula")).toBe("Ana Paula");
  });
});

describe("validateNickname", () => {
  it("aceita apelidos de 2 a 20 caracteres", () => {
    expect(validateNickname("Jú")).toEqual({ ok: true, nickname: "Jú", key: "ju" });
    expect(validateNickname("a".repeat(20)).ok).toBe(true);
  });

  it("recusa curtos e longos (contando caracteres, não bytes)", () => {
    expect(validateNickname(" a ")).toEqual({ ok: false, reason: "length" });
    expect(validateNickname("a".repeat(21))).toEqual({ ok: false, reason: "length" });
    expect(validateNickname("é".repeat(20)).ok).toBe(true);
  });

  it("recusa palavrões", () => {
    expect(validateNickname("Porra")).toEqual({ ok: false, reason: "blocked" });
  });
});

describe("isBlockedNickname", () => {
  it.each(["P0rr4", "c a r a l h o", "Merdaaa", "zé puta", "FDP", "cu", "vsf"])(
    "bloqueia %s",
    (n) => {
      expect(isBlockedNickname(n)).toBe(true);
    },
  );

  it.each(["Computador", "Pintor", "Cuca", "Paulo", "Rafa QA", "Bia CX", "Escuta", "Marcão"])(
    "não bloqueia %s",
    (n) => {
      expect(isBlockedNickname(n)).toBe(false);
    },
  );
});
