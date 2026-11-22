import { ApiRequestError } from "./api";

/** Mensagem específica. O status real permanece visível e não vira sucesso. */
export function receiptFeedback(error: unknown, action: "list" | "download" = "list"): string {
  const verb = action === "download" ? "baixar o comprovante" : "consultar os comprovantes";
  if (error instanceof ApiRequestError && (error.status === 403 || error.kind === "forbidden")) {
    return `Seu perfil não pode ${verb} (403).`;
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return action === "download" ? "Comprovante não encontrado (404)." : "Lançamento não encontrado para consultar comprovantes (404).";
  }
  if (error instanceof ApiRequestError && error.kind === "timeout") {
    return `A tentativa de ${verb} excedeu o tempo. Tente novamente.`;
  }
  if (error instanceof ApiRequestError && error.kind === "network") {
    return `Sem conexão para ${verb}. Verifique a rede e tente novamente.`;
  }
  if (error instanceof ApiRequestError && error.status) {
    return `Não foi possível ${verb} (HTTP ${error.status}).`;
  }
  return `Não foi possível ${verb}.`;
}

export const RECEIPT_EMPTY = "Nenhum comprovante anexado.";
