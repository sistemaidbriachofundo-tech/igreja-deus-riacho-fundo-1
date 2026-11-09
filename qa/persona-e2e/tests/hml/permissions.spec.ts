import { test } from "@playwright/test";
import { ACCOUNTS, apiBase, apiStatus, loginAccount, type PersonaAccount } from "../../src/accounts";
import { keep, finish, row } from "../../src/commit";
import type { MatrixRow, Verdict } from "../../src/matrix";
import { isReachable } from "../../src/surface";

type Probe = {
  id: string;
  path: string;
  allowed: ReadonlyArray<PersonaAccount["persona"]>;
};

const PROBES: readonly Probe[] = [
  { id: "busca-pessoas", path: "/persons/search?q=Demo&limit=5", allowed: ["SECRETARIA", "PASTOR", "ADMIN"] },
  { id: "membros", path: "/memberships", allowed: ["SECRETARIA", "ADMIN"] },
  { id: "tesouraria", path: "/ledger/accounts", allowed: ["TESOURARIA"] },
  { id: "pastoral", path: "/pastoral-cases", allowed: ["PASTOR"] },
  { id: "ministerios", path: "/ministries", allowed: ["SECRETARIA", "PASTOR", "LIDER", "ADMIN"] },
  { id: "site", path: "/cms/site-layout", allowed: ["SECRETARIA", "PASTOR", "ADMIN"] },
];

function verdict(status: number, allowed: boolean): { status: Verdict; detail: string } {
  if (status >= 500) {
    return { status: "FAIL", detail: `A API respondeu ${status} em vez de autorizar ou recusar.` };
  }
  if (allowed) {
    return status === 401 || status === 403
      ? { status: "FAIL", detail: `Papel autorizado recebeu HTTP ${status}.` }
      : { status: "PASS", detail: `Acesso permitido (HTTP ${status}).` };
  }
  return status === 403
    ? { status: "PASS", detail: "Acesso recusado com HTTP 403." }
    : { status: "FAIL", detail: `Papel sem concessão recebeu HTTP ${status}, não 403.` };
}

test.describe("permissões da API", () => {
  for (const account of ACCOUNTS) {
    test(`${account.persona} respeita os contratos`, async ({ request }) => {
      const bucket: MatrixRow[] = [];
      const apiUp = await isReachable(request, `${apiBase()}/health`);
      if (!apiUp) {
        keep(row(`${account.persona}/api-permissoes`, account.persona, "Controles de permissão", "BLOCKED", "API local indisponível."), bucket);
        finish(bucket);
        return;
      }
      const login = await loginAccount(request, account);
      if (!account.seeded || !login.session) {
        keep(row(
          `${account.persona}/permissoes`,
          account.persona,
          "Controles de permissão",
          "BLOCKED",
          account.seeded
            ? `Login sintético recusado (HTTP ${login.status}).`
            : "Sem usuário sintético EDITOR_SITE no seed. A checagem de editor fica bloqueada na frente de identidade.",
        ), bucket);
        finish(bucket);
        return;
      }

      for (const probe of PROBES) {
        const status = await apiStatus(request, login.session.token, "GET", probe.path);
        const result = verdict(status, probe.allowed.includes(account.persona));
        keep(row(
          `${account.persona}/api-${probe.id}`,
          account.persona,
          `API ${probe.path.split("?")[0]}`,
          result.status,
          result.detail,
        ), bucket);
      }

      const own = await apiStatus(request, login.session.token, "GET", "/credentials/me");
      const memberCard = account.persona === "MEMBRO" || account.persona === "SECRETARIA" || account.persona === "ADMIN";
      const card = verdict(own, memberCard);
      keep(row(
        `${account.persona}/api-carteirinha`,
        account.persona,
        "API /credentials/me",
        card.status,
        memberCard && (own === 200 || own === 404)
          ? `Papel com rota própria respondeu HTTP ${own}.`
          : card.detail,
      ), bucket);
      finish(bucket);
    });
  }
});
