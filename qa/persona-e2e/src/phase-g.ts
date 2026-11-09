/**
 * Classificação da frente G. PASS só quando o fato observado cumpre o contrato.
 * 501, placeholder e ausência de conta sintética não viram PASS.
 */

export type GVerdict = "PASS" | "FAIL" | "BLOCKED";

export type GPersonaId =
  | "ADMIN"
  | "PASTOR"
  | "SECRETARIA"
  | "TESOURARIA"
  | "LIDER"
  | "MEMBRO"
  | "EDITOR"
  | "PUBLICADOR";

export type GPersona = {
  id: GPersonaId;
  email: string;
  role: string;
  seeded: boolean;
};

export const PHASE_G_PERSONAS: readonly GPersona[] = [
  { id: "ADMIN", email: "platform.demo@example.test", role: "PLATFORM_ADMIN", seeded: true },
  { id: "PASTOR", email: "pastor.demo@example.test", role: "PASTOR", seeded: true },
  { id: "SECRETARIA", email: "ana.demo@example.test", role: "SECRETARIA", seeded: true },
  { id: "TESOURARIA", email: "tesouraria.demo@example.test", role: "TESOURARIA", seeded: true },
  { id: "LIDER", email: "lider.jovens.demo@example.test", role: "LIDER_MINISTERIO", seeded: true },
  { id: "MEMBRO", email: "bruno.demo@example.test", role: "MEMBRO", seeded: true },
  { id: "EDITOR", email: "editor.demo@example.test", role: "EDITOR_SITE", seeded: true },
  { id: "PUBLICADOR", email: "publicador.demo@example.test", role: "PUBLICADOR_SITE", seeded: false },
];

const MENU = {
  painel: "Painel",
  membros: "Membros e famílias",
  secretaria: "Secretaria",
  carteirinhas: "Carteirinhas",
  operacao: "Ministérios e operação",
  vinculo: "Vínculo de ministério",
  escalas: "Escalas",
  meuEspaco: "Meu Espaço",
  tesouraria: "Tesouraria",
  editorial: "Mídia e conteúdo",
  site: "Gestão do site",
} as const;

/** Módulos compatíveis com o que o backend autoriza hoje. Tesouraria não entra no admin técnico. */
export const MENU_ALLOW: Record<GPersonaId, readonly string[]> = {
  ADMIN: [MENU.painel, MENU.membros, MENU.secretaria, MENU.carteirinhas, MENU.operacao, MENU.vinculo, MENU.editorial, MENU.site],
  PASTOR: [MENU.painel, MENU.membros, MENU.secretaria, MENU.operacao, MENU.vinculo, MENU.escalas, MENU.meuEspaco, MENU.editorial, MENU.site],
  SECRETARIA: [MENU.painel, MENU.membros, MENU.secretaria, MENU.carteirinhas, MENU.operacao, MENU.vinculo, MENU.escalas, MENU.meuEspaco, MENU.editorial, MENU.site],
  TESOURARIA: [MENU.painel, MENU.tesouraria],
  LIDER: [MENU.painel, MENU.operacao, MENU.vinculo, MENU.escalas, MENU.meuEspaco],
  MEMBRO: [MENU.painel, MENU.meuEspaco, MENU.carteirinhas],
  EDITOR: [MENU.painel, MENU.editorial, MENU.site],
  PUBLICADOR: [MENU.painel, MENU.editorial, MENU.site],
};

export function codeOf(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

export function recordOf(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function classifyLoginMe(input: {
  seeded: boolean;
  expectedEmail: string;
  expectedRole: string;
  loginStatus: number;
  meStatus: number | null;
  email?: string | null;
  roles?: string[];
  organizationId?: string | null;
  churchId?: string | null;
  personId?: string | null;
}): { status: GVerdict; detail: string } {
  const loginOk = input.loginStatus === 200 || input.loginStatus === 201;
  if (!input.seeded && !loginOk) {
    return {
      status: "BLOCKED",
      detail: `O catálogo tem ${input.expectedRole}, mas o seed sintético não cria a conta (login HTTP ${input.loginStatus}). Sem usuário, /auth/me não foi exercido. Nenhum segredo foi registrado.`,
    };
  }
  if (!loginOk) {
    return {
      status: "FAIL",
      detail: `POST /auth/login respondeu HTTP ${input.loginStatus} para a conta sintética prevista.`,
    };
  }
  if (input.meStatus !== 200) {
    return {
      status: "FAIL",
      detail: `O login foi aceito, mas GET /auth/me respondeu HTTP ${input.meStatus ?? "ausente"}.`,
    };
  }
  const roles = input.roles ?? [];
  if (input.email !== input.expectedEmail || !roles.includes(input.expectedRole)) {
    return {
      status: "FAIL",
      detail: `GET /auth/me não devolveu o e-mail sintético com o papel ${input.expectedRole}. Papéis recebidos: ${roles.join(", ") || "nenhum"}.`,
    };
  }
  if (!input.organizationId || !input.churchId || !input.personId) {
    return {
      status: "FAIL",
      detail: "GET /auth/me omitiu organizationId, churchId ou personId.",
    };
  }
  return {
    status: "PASS",
    detail: `POST /auth/login e GET /auth/me confirmaram ${input.expectedRole} na organização e na congregação ativas.`,
  };
}

export function classifyExpectedStatus(actual: number, expected: number, ok: string): { status: GVerdict; detail: string } {
  if (actual === expected) return { status: "PASS", detail: ok };
  return { status: "FAIL", detail: `HTTP ${actual}; o contrato desta jornada espera ${expected}. ${ok}` };
}

export function classifyFormalMembership(status: number, body: unknown): {
  persistence: GVerdict;
  honesty: GVerdict;
  detail: string;
} {
  const code = codeOf(body);
  const members = recordOf(body)?.members;
  if (status === 501 && code === "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED" && members == null) {
    return {
      persistence: "BLOCKED",
      honesty: "PASS",
      detail:
        "HTTP 501 MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED e members nulo. A API não grava integrante formal. O schema é do integrador H. A resposta não inventa a lista.",
    };
  }
  if (status === 200 && Array.isArray(members)) {
    return {
      persistence: "PASS",
      honesty: "PASS",
      detail: `HTTP 200 devolveu ${members.length} integrante(s) formal(is) persistido(s).`,
    };
  }
  return {
    persistence: "FAIL",
    honesty: "FAIL",
    detail: `HTTP ${status} código ${code || "ausente"}. Não há lista persistida nem o bloqueio 501 explícito.`,
  };
}

export function unexpectedModules(persona: GPersonaId, labels: string[]): string[] {
  const allow = new Set(MENU_ALLOW[persona]);
  return [...new Set(labels.filter((label) => !allow.has(label)))];
}

export function classifyMenu(persona: GPersonaId, labels: string[]): { status: GVerdict; detail: string } {
  const extra = unexpectedModules(persona, labels);
  if (labels.length === 0) {
    return { status: "FAIL", detail: "A navegação autenticada não expôs módulos." };
  }
  if (extra.length === 0) {
    return { status: "PASS", detail: "O menu mostra só módulos compatíveis com o papel." };
  }
  return {
    status: "FAIL",
    detail: `Menu genérico. Fora do papel: ${extra.join(", ")}.`,
  };
}

export function classifyOwnAgenda(input: {
  listStatus: number;
  disclosesGap: boolean;
  renderedScheduleItems: number;
}): { honesty: GVerdict; persistence: GVerdict; honestyDetail: string; persistenceDetail: string } {
  if (input.renderedScheduleItems > 0 && input.listStatus !== 200) {
    return {
      honesty: "FAIL",
      persistence: "FAIL",
      honestyDetail: "A tela listou escala sem uma consulta autorizada da agenda própria.",
      persistenceDetail: `GET da listagem respondeu HTTP ${input.listStatus} e a interface ainda assim mostrou itens.`,
    };
  }
  if (input.listStatus === 200 && input.renderedScheduleItems > 0) {
    return {
      honesty: "PASS",
      persistence: "PASS",
      honestyDetail: "A lista exibida corresponde a uma consulta autorizada.",
      persistenceDetail: "A agenda própria foi devolvida pela API e apareceu na tela.",
    };
  }
  if (input.disclosesGap && input.renderedScheduleItems === 0) {
    return {
      honesty: "PASS",
      persistence: "BLOCKED",
      honestyDetail: "Meu Espaço declara que não há consulta da agenda pessoal e não monta lista de outras pessoas.",
      persistenceDetail: `Não existe agenda própria persistida para este perfil (listagem HTTP ${input.listStatus}). Confirmar pelo identificador não substitui a lista.`,
    };
  }
  return {
    honesty: "FAIL",
    persistence: "BLOCKED",
    honestyDetail: "A tela não deixa claro que a agenda pessoal está ausente.",
    persistenceDetail: `Listagem HTTP ${input.listStatus}. Sem itens autorizados para aprovar persistência.`,
  };
}

export function classifyFinanceHonesty(input: {
  apiStatus: number;
  metricTexts: string[];
  pageText: string;
}): { status: GVerdict; detail: string } {
  const pixAction = /pagar com pix|chave pix|qr code pix|cobrar agora/i.test(input.pageText);
  const blocked = /banco, pix e maquininha estão bloqueados/i.test(input.pageText);
  const illustration = /não é saldo da igreja/i.test(input.pageText);
  const metrics = input.metricTexts.join(" | ") || "sem métricas";
  if (pixAction) {
    return { status: "FAIL", detail: "A tela oferece uma ação de Pix ou cobrança." };
  }
  if (input.apiStatus !== 200) {
    const invented = input.metricTexts.some((text) => /R\$\s*\d/.test(text));
    if (invented || !/sem consulta/i.test(metrics)) {
      return { status: "FAIL", detail: `Sem HTTP 200 do ledger, as métricas não ficaram em “Sem consulta”: ${metrics}.` };
    }
    if (!blocked || !illustration) {
      return { status: "FAIL", detail: "Falta o aviso de Pix/banco bloqueado ou o rótulo de que a ilustração não é saldo." };
    }
    return {
      status: "PASS",
      detail: "A conta não leu o ledger. As métricas dizem Sem consulta, a ilustração está rotulada e não há Pix.",
    };
  }
  const numeric = input.metricTexts.some((text) => /R\$\s*\d/.test(text));
  if (!blocked || !illustration || !numeric) {
    return {
      status: "FAIL",
      detail: "O ledger respondeu, mas a tela mistura ilustração e posição ou omite o bloqueio de Pix e banco.",
    };
  }
  return {
    status: "PASS",
    detail: "A posição exibida veio do ledger sintético. A ilustração está separada e Pix, banco e maquininha seguem bloqueados.",
  };
}

export function classifyDraftRoundtrip(input: {
  readStatus: number;
  saveStatus: number;
  markerSeen: boolean;
  restored: boolean;
  publishedDuringTest: boolean;
}): { status: GVerdict; detail: string } {
  if (input.publishedDuringTest) {
    return { status: "FAIL", detail: "O teste publicou o site. A jornada de rascunho não pode alterar a página institucional." };
  }
  if (input.readStatus === 200 && input.saveStatus === 200 && input.markerSeen && input.restored) {
    return {
      status: "PASS",
      detail: "O rascunho do editor foi gravado, relido e restaurado. A publicação institucional não foi chamada.",
    };
  }
  if (input.readStatus === 501 || input.saveStatus === 501) {
    return { status: "BLOCKED", detail: `Editor respondeu 501 (leitura ${input.readStatus}, gravação ${input.saveStatus}).` };
  }
  return {
    status: "FAIL",
    detail: `Rascunho não fechou o ciclo. Leitura HTTP ${input.readStatus}, gravação HTTP ${input.saveStatus}, marcador ${input.markerSeen ? "visto" : "ausente"}, restauração ${input.restored ? "ok" : "pendente"}.`,
  };
}

export function classifyPublicationGate(input: {
  httpStatus: number;
  buttonDisabled: boolean;
  refusesCredential: boolean;
}): { status: GVerdict; detail: string } {
  if (input.httpStatus === 0) {
    return { status: "BLOCKED", detail: "O link oficial não respondeu neste ambiente." };
  }
  if (input.httpStatus === 200 && input.buttonDisabled && input.refusesCredential) {
    return {
      status: "PASS",
      detail: "No link oficial o botão de entrar permanece desabilitado e a página avisa que nenhuma credencial será enviada.",
    };
  }
  return {
    status: "FAIL",
    detail: `Link oficial HTTP ${input.httpStatus}. Botão desabilitado: ${input.buttonDisabled}. Aviso de credencial: ${input.refusesCredential}.`,
  };
}

export function classifyOverflow(pixels: number): GVerdict {
  return pixels <= 1 ? "PASS" : "FAIL";
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const fg = 0.2126 * channel(foreground[0]) + 0.7152 * channel(foreground[1]) + 0.0722 * channel(foreground[2]);
  const bg = 0.2126 * channel(background[0]) + 0.7152 * channel(background[1]) + 0.0722 * channel(background[2]);
  const light = Math.max(fg, bg);
  const dark = Math.min(fg, bg);
  return (light + 0.05) / (dark + 0.05);
}

export function classifyContrast(ratio: number, large = false): GVerdict {
  return ratio >= (large ? 3 : 4.5) - 1e-6 ? "PASS" : "FAIL";
}

export function classifyFocusVisible(outlineWidth: number, boxShadow: string): GVerdict {
  const shadow = boxShadow.trim() !== "" && boxShadow !== "none";
  return outlineWidth > 0 || shadow ? "PASS" : "FAIL";
}

type BugRow = { id: string; persona: string; journey: string; status: GVerdict; detail: string };

export function renderBugs(rows: BugRow[]): string {
  const relevant = rows.filter((row) => row.id.startsWith("G/") && row.status !== "PASS");
  const lines = [
    "# Achados da frente G",
    "",
    "Estes itens saíram da execução. PASS não entra aqui. Nenhum deles autoriza merge ou deploy.",
    "",
    "| ID | Persona | Resultado | Jornada | O que foi observado |",
    "|---|---|---|---|---|",
  ];
  for (const row of relevant) {
    const detail = row.detail.replace(/\|/g, "/").replace(/\n/g, " ");
    lines.push(`| ${row.id} | ${row.persona} | ${row.status} | ${row.journey} | ${detail} |`);
  }
  if (relevant.length === 0) lines.push("| — | — | — | — | Nenhum FAIL ou BLOCKED com prefixo G/. |");
  lines.push("");
  return lines.join("\n");
}
