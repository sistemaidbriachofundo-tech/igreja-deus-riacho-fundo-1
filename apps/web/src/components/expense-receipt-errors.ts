import { ApiRequestError } from "../lib/api";

/** Falhas de acesso não devem ser confundidas com a ausência legítima de anexos. */
export function receiptLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para consultar os comprovantes.";
    if (error.status === 403) return "Este perfil não tem permissão para consultar os comprovantes desta despesa ou congregação.";
    if (error.status === 404) return "A despesa ou seu anexo não foi encontrado nesta congregação.";
    if (error.status === 429) return "Muitas consultas em sequência. Aguarde e tente novamente.";
    if (error.kind === "timeout") return "A consulta demorou além do esperado. Tente novamente.";
    if (error.kind === "network") return "Sem conexão com a API de comprovantes. Confira a rede e tente novamente.";
  }
  return "A consulta aos comprovantes falhou. Tente novamente; se persistir, informe o suporte.";
}
