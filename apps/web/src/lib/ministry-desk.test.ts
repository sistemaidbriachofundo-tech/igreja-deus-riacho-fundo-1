import { describe, expect, it } from "vitest";
import {
  MINISTRY_FINANCE_CONTRACT_APPROVED,
  acceptFormalMembers,
  interpretConversion,
  interpretMembershipChange,
  loadMinistryDesk,
  presentFinance,
  readInterests,
  requestFormalAdmission,
  requestInterestConversion,
} from "./ministry-desk";

const token = "token-sintetico";
const base = "http://api.test";

function json(status: number, body: unknown) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("catálogo formal de ministério", () => {
  it("não promove interesse em etapa EQUIPE a integrante", () => {
    const interest = {
      id: "int-sint-01",
      displayName: "Pessoa Sintética",
      email: "pessoa.sintetica@example.test",
      phone: "000000000",
      notesInternal: "sigilo",
      stage: "EQUIPE",
      status: "OPEN",
    };
    expect(acceptFormalMembers({ blocked: false, members: [interest] })).toBeNull();
    expect(readInterests({ interests: [interest] })).toEqual([
      {
        id: "int-sint-01",
        displayName: "Pessoa Sintética",
        stage: "EQUIPE",
        status: "OPEN",
        formalMember: false,
      },
    ]);
    expect(JSON.stringify(readInterests({ interests: [interest] }))).not.toContain("example.test");
    expect(JSON.stringify(readInterests({ interests: [interest] }))).not.toContain("sigilo");
  });

  it("aceita somente o contrato formal quando ele existir", () => {
    const members = acceptFormalMembers({
      blocked: false,
      members: [
        {
          id: "mmb-sint-01",
          personId: "per-sint-01",
          displayName: "Pessoa Sintética",
          role: "INTEGRANTE",
          status: "ATIVO",
          email: "nao-usar@example.test",
        },
      ],
    });
    expect(members).toEqual([
      {
        id: "mmb-sint-01",
        personId: "per-sint-01",
        displayName: "Pessoa Sintética",
        role: "INTEGRANTE",
        status: "ATIVO",
      },
    ]);
    expect(acceptFormalMembers({ blocked: true, members: [] })).toBeNull();
  });

  it("líder dos Homens recebe 403 ao consultar Mulheres e não pede o restante", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith("/ministries")) {
        return json(200, {
          ministries: [
            { id: "min-homens", name: "Homens" },
            { id: "min-mulheres", name: "Mulheres" },
          ],
        });
      }
      if (url.includes("/min-mulheres/formal-memberships")) {
        return json(403, {
          statusCode: 403,
          code: "MINISTRY_SCOPE_FORBIDDEN",
          message: "Líder só visualiza dados do ministério autorizado.",
        });
      }
      return json(500, { message: "não deveria ser chamado" });
    };

    const desk = await loadMinistryDesk({
      token,
      baseUrl: base,
      ministryId: "min-mulheres",
      fetchImpl,
    });

    expect(desk.kind).toBe("denied");
    if (desk.kind === "denied") {
      expect(desk.status).toBe(403);
      expect(desk.ministry.name).toBe("Mulheres");
      expect(desk.code).toBe("MINISTRY_SCOPE_FORBIDDEN");
    }
    expect(calls.some((url) => url.includes("volunteer-interests"))).toBe(false);
    expect(calls.some((url) => url.includes("cost-center-balance"))).toBe(false);
    expect(calls.some((url) => url.includes("/agenda"))).toBe(false);
  });

  it("no ministério autorizado separa interesse, oculta saldo e não cria integrante", async () => {
    const fetchImpl = async (url: string, init?: { method?: string }) => {
      if (url.endsWith("/ministries")) {
        return json(200, { ministries: [{ id: "min-homens", name: "Homens" }] });
      }
      if (url.endsWith("/formal-memberships")) {
        return json(501, {
          blocked: true,
          code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED",
          members: null,
          message: "Sem tabela de integrante.",
        });
      }
      if (url.endsWith("/agenda")) {
        return json(501, {
          blocked: true,
          code: "MINISTRY_AGENDA_MODEL_BLOCKED",
          scheduleText: "Sábado, 16h — encontro sintético",
          items: [{ title: "Escala de outro ministério" }],
          message: "Agenda estruturada bloqueada.",
        });
      }
      if (url.endsWith("/requests")) {
        return json(501, {
          blocked: true,
          code: "MINISTRY_REQUEST_MODEL_BLOCKED",
          requests: null,
          message: "Solicitações bloqueadas.",
        });
      }
      if (url.endsWith("/cost-center-balance")) {
        return json(501, {
          blocked: true,
          code: "MINISTRY_FINANCE_CONTRACT_BLOCKED",
          balance: 1500.5,
          message: "Saldo condicionado à issue 96.",
        });
      }
      if (url.includes("/volunteer-interests")) {
        return json(200, {
          interests: [
            {
              id: "int-sint-01",
              displayName: "Pessoa Sintética",
              email: "pessoa.sintetica@example.test",
              phone: "000000000",
              stage: "EQUIPE",
              status: "OPEN",
            },
          ],
        });
      }
      if (init?.method === "POST") {
        return json(501, {
          blocked: true,
          code: "MINISTRY_INTEREST_CONVERSION_BLOCKED",
          createdMembership: { id: "nao-gravar" },
          message: "Conversão bloqueada.",
        });
      }
      return json(404, { message: url });
    };

    const desk = await loadMinistryDesk({ token, baseUrl: base, fetchImpl });
    expect(desk.kind).toBe("ready");
    if (desk.kind !== "ready") return;
    expect(desk.membership).toMatchObject({ kind: "blocked", members: null });
    expect(desk.interests).toHaveLength(1);
    expect(desk.interests[0]?.formalMember).toBe(false);
    expect(desk.interests[0]?.displayName).toBe("Pessoa Sintética");
    expect(JSON.stringify(desk.interests)).not.toContain("example.test");
    expect(desk.agenda).toMatchObject({
      kind: "blocked",
      items: null,
      scheduleText: "Sábado, 16h — encontro sintético",
    });
    expect(desk.requests).toMatchObject({ kind: "blocked", requests: null });
    expect(MINISTRY_FINANCE_CONTRACT_APPROVED).toBe(false);
    expect(desk.finance).toMatchObject({ kind: "blocked", balance: null, dependency: "issue-96" });
    expect(JSON.stringify(desk.finance)).not.toContain("1500");

    const conversion = await requestInterestConversion({
      token,
      baseUrl: base,
      ministryId: "min-homens",
      volunteerInterestId: "int-sint-01",
      fetchImpl,
    });
    expect(conversion.created).toBe(false);
    expect(conversion.member).toBeNull();
    expect(conversion.code).toBe("MINISTRY_INTEREST_CONVERSION_BLOCKED");
  });

  it("não trata 501 com objeto solto como integrante criado", () => {
    const result = interpretConversion(501, {
      createdMembership: {
        id: "mmb-sint-01",
        personId: "per-sint-01",
        displayName: "Pessoa Sintética",
        role: "INTEGRANTE",
        status: "ATIVO",
      },
    });
    expect(result.created).toBe(false);
    expect(result.member).toBeNull();
  });

  it("grava inclusão só com 201 formal e recusa 501 com objeto solto", async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, body: init?.body });
      if (url.endsWith("/formal-memberships") && init?.method === "POST") {
        return json(501, {
          blocked: true,
          code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED",
          createdMembership: {
            id: "mmb-falso",
            personId: "per-sint-01",
            displayName: "Pessoa Sintética",
            role: "INTEGRANTE",
            status: "ATIVO",
          },
        });
      }
      return json(404, { message: url });
    };
    const blocked = await requestFormalAdmission({
      token,
      baseUrl: base,
      ministryId: "min-jovens",
      personId: "per-sint-01",
      role: "INTEGRANTE",
      fetchImpl,
    });
    expect(blocked.applied).toBe(false);
    expect(blocked.member).toBeNull();
    expect(calls[0]?.url).toContain("/min-jovens/formal-memberships");
    expect(calls[0]?.body).toContain("\"role\":\"INTEGRANTE\"");

    const ready = interpretMembershipChange(201, {
      blocked: false,
      code: "MINISTRY_MEMBERSHIP_CREATED",
      auditId: "aud-sint-01",
      createdMembership: {
        id: "mmb-sint-01",
        personId: "per-sint-01",
        displayName: "Pessoa Sintética",
        role: "INTEGRANTE",
        status: "ATIVO",
        email: "nao-usar@example.test",
      },
    });
    expect(ready.applied).toBe(true);
    expect(ready.member).toEqual({
      id: "mmb-sint-01",
      personId: "per-sint-01",
      displayName: "Pessoa Sintética",
      role: "INTEGRANTE",
      status: "ATIVO",
    });
    expect(ready.message).toContain("aud-sint-01");
    expect(JSON.stringify(ready.member)).not.toContain("@");
    expect(
      interpretMembershipChange(403, {
        code: "MINISTRY_SCOPE_FORBIDDEN",
        message: "Líder só visualiza dados do ministério autorizado.",
      }).applied,
    ).toBe(false);
  });

  it("não consulta outro ministério quando o id não está na lista autorizada", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith("/ministries")) {
        return json(200, { ministries: [{ id: "min-homens", name: "Homens", slug: "homens" }] });
      }
      return json(500, { message: "não deveria ser chamado" });
    };
    const desk = await loadMinistryDesk({
      token,
      baseUrl: base,
      ministryId: "min-mulheres",
      fetchImpl,
    });
    expect(desk.kind).toBe("denied");
    if (desk.kind === "denied") {
      expect(desk.status).toBe(403);
      expect(desk.code).toBe("MINISTRY_SCOPE_FORBIDDEN");
    }
    expect(calls).toEqual([`${base}/ministries`]);
  });

  it("descarta saldo numérico mesmo em resposta 200", () => {
    const panel = presentFinance(200, { balance: 80, code: "OK" });
    expect(panel.balance).toBeNull();
    expect(panel.kind).toBe("blocked");
    expect(JSON.stringify(panel)).not.toContain("80");
  });
});
