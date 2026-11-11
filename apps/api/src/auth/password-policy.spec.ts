import { BadRequestException } from "@nestjs/common";
import {
  PASSWORD_POLICY_MESSAGE,
  assertPasswordPolicy,
  passwordMeetsPolicy,
} from "./password-policy";

describe("password policy", () => {
  it("accepts a long mixed password that is not the mailbox", () => {
    expect(passwordMeetsPolicy("Fixture-14+-caracteres", "person@example.test")).toBe(true);
    expect(() => assertPasswordPolicy("Fixture-14+-caracteres", "person@example.test")).not.toThrow();
  });

  it("rejects weak passwords with one public message", () => {
    const samples = [
      "curta",
      "todasminusculas14",
      "TODASMAIUSCULAS14",
      "SemDigitoNenhuma",
      "Admin1234567890",
      "pessoa1234567890A",
    ];
    const messages = new Set<string>();
    for (const password of samples) {
      try {
        assertPasswordPolicy(password, "pessoa@example.test");
        throw new Error(`aceitou ${password}`);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const message = (error as BadRequestException).message;
        expect(message).toBe(PASSWORD_POLICY_MESSAGE);
        expect(message).not.toContain(password);
        messages.add(message);
      }
    }
    expect(messages.size).toBe(1);
  });
});
