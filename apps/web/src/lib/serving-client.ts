import { getApiBaseUrl } from "./api";
import { interpretRosterProbe } from "./serving-rosters";

/**
 * Consulta só o status de GET /rosters.
 * O corpo é descartado para Meu Espaço nunca renderizar escalas de outras pessoas.
 */
export async function probeChurchRosterList(
  token: string,
): Promise<"forbidden" | "allowed" | "unavailable"> {
  const response = await fetch(`${getApiBaseUrl()}/rosters`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await response.text();
  return interpretRosterProbe(response.status);
}
