import { parseRiachinhoSuggestion } from "../lib/riachinho-suggestion";
import { findPersonalData } from "./workflow";

export type RiachinhoProvider = {
  provider: "mock" | "gemini" | "manus";
  credentialsReady: boolean;
};

/** Provedor desta frente: simulado e sem credencial. O envio real não é habilitado. */
export const SIMULATED_PROVIDER: RiachinhoProvider = {
  provider: "mock",
  credentialsReady: false,
};

const PRIVATE_TOPIC =
  /\b(ficha|membros?|pastoral|aconselhamento|menor de idade|crian[cç]as?|diagn[oó]stico|secret[aá]ria)\b/i;

/**
 * Nunca transmite a pergunta. Bloqueia dado sensível, provedor mock e chamada real.
 */
export function gateRiachinhoPrompt(
  text: string,
  provider: RiachinhoProvider = SIMULATED_PROVIDER,
): { sent: false; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { sent: false, reason: "Escreva uma orientação editorial, sem dados de pessoas. Nada foi enviado." };
  }
  if (findPersonalData(trimmed) || PRIVATE_TOPIC.test(trimmed)) {
    return { sent: false, reason: "A pergunta contém dado pessoal, pastoral ou de membro e não será enviada." };
  }
  if (provider.provider === "mock" || !provider.credentialsReady) {
    return { sent: false, reason: "Envio bloqueado: o provedor está simulado ou sem credencial. Nada foi enviado." };
  }
  return { sent: false, reason: "Envio real bloqueado nesta frente isolada. Nada foi transmitido à API." };
}

/** Aplica só os Alts citados. Os demais índices permanecem como estavam. */
export function applyAltSuggestion(
  alts: Array<string | undefined>,
  reply: string,
): { alts: Array<string | undefined>; applied: number } {
  const parsed = parseRiachinhoSuggestion(reply, "alts");
  if (!parsed?.alts) return { alts, applied: 0 };
  const next = alts.map((alt, index) => parsed.alts?.[index] ?? alt);
  const applied = next.reduce((count, alt, index) => count + (alt !== alts[index] ? 1 : 0), 0);
  return { alts: next, applied };
}
