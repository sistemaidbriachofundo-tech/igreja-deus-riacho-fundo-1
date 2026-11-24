/** Códigos estáveis da UX preventiva. A resposta nunca carrega e-mail, telefone, CPF ou endereço. */

export const PREVENTIVE_CODES = [
  "PERSON_IDENTITY_EXACT",
  "PERSON_POSSIBLE_HOMONYM",
  "ADMISSION_ALREADY_OPEN",
  "MEMBERSHIP_ALREADY_ACTIVE",
  "FAMILY_LINK_EXISTS",
  "FAMILY_MOVE_REQUIRED",
  "MINISTRY_MEMBERSHIP_ALREADY_ACTIVE",
  "ROSTER_SERVICE_CONFLICT",
  "ROSTER_UNAVAILABLE",
  "ROSTER_IMPEDIMENT",
  "ROSTER_NOT_ELIGIBLE",
  "SERVICE_ORDER_MISSING_RESPONSIBLE",
  "SERVICE_ORDER_SCHEDULE_CONFLICT",
  "ACCESS_ALREADY_GRANTED",
  "ACCESS_INVITE_OPEN",
  "CONNECTION_TRAIL_ALREADY_LINKED",
  "CHECK_IN_ALREADY_RECORDED",
  "LEDGER_POSSIBLE_DUPLICATE",
] as const;

export type PreventiveCode = (typeof PREVENTIVE_CODES)[number];

export type PreventiveExisting = { id: string; status: string };

export type PreventiveCopy = {
  title: string;
  message: string;
  action: string;
  cancel: string;
};

export const PREVENTIVE_COPY: Record<PreventiveCode, PreventiveCopy> = {
  PERSON_IDENTITY_EXACT: {
    title: "Cadastro já existente",
    message: "Encontramos uma ficha com o mesmo e-mail ou o mesmo CPF. Nenhum contato ou documento foi exibido. Abra a ficha existente.",
    action: "Abrir ficha",
    cancel: "Voltar",
  },
  PERSON_POSSIBLE_HOMONYM: {
    title: "Possível homônimo",
    message: "Há uma pessoa com o mesmo nome. Isso não impede o cadastro e nenhum contato ou documento foi exibido. Continue só se for outra pessoa.",
    action: "Cadastrar mesmo assim",
    cancel: "Voltar",
  },
  ADMISSION_ALREADY_OPEN: {
    title: "Admissão já em andamento",
    message: "Esta pessoa já tem um protocolo de admissão aberto. Nenhum protocolo novo foi criado. Abra a ficha para continuar o que está em análise.",
    action: "Abrir ficha",
    cancel: "Voltar",
  },
  MEMBERSHIP_ALREADY_ACTIVE: {
    title: "Membresia já ativa",
    message: "Esta pessoa já é membro ativo. A admissão não foi reaberta.",
    action: "Abrir ficha",
    cancel: "Voltar",
  },
  FAMILY_LINK_EXISTS: {
    title: "Vínculo de família já existe",
    message: "Esta pessoa já está nesta família. Nenhum vínculo novo foi criado.",
    action: "Ver família",
    cancel: "Voltar",
  },
  FAMILY_MOVE_REQUIRED: {
    title: "Pessoa já vinculada a uma família",
    message: "A mudança tira o vínculo atual. Os outros integrantes dessa família não são listados aqui. Confirme somente se a mudança for intencional.",
    action: "Mover vínculo",
    cancel: "Manter família atual",
  },
  MINISTRY_MEMBERSHIP_ALREADY_ACTIVE: {
    title: "Integrante já vinculado",
    message: "Esta pessoa já integra este ministério. Nenhum vínculo novo foi criado. Confira a lista de integrantes.",
    action: "Ver lista",
    cancel: "Voltar",
  },
  ROSTER_SERVICE_CONFLICT: {
    title: "Conflito de horário na escala",
    message: "A pessoa já está designada neste horário. Revise a escala antes de gravar outra função.",
    action: "Revisar escala",
    cancel: "Voltar",
  },
  ROSTER_UNAVAILABLE: {
    title: "Pessoa indisponível",
    message: "A disponibilidade informada não cobre este culto. Escolha outra pessoa ou ajuste a disponibilidade.",
    action: "Revisar disponibilidade",
    cancel: "Voltar",
  },
  ROSTER_IMPEDIMENT: {
    title: "Impedimento na escala",
    message: "Há um impedimento para esta pessoa neste culto. A designação não foi gravada.",
    action: "Revisar impedimento",
    cancel: "Voltar",
  },
  ROSTER_NOT_ELIGIBLE: {
    title: "Pessoa fora da regra da escala",
    message: "A frequência ou a regra do ministério não permite esta designação. A escala não foi alterada.",
    action: "Revisar regras",
    cancel: "Voltar",
  },
  SERVICE_ORDER_MISSING_RESPONSIBLE: {
    title: "Responsável ausente",
    message: "Cada etapa precisa de um responsável antes da aprovação ou da publicação. O roteiro continua em rascunho.",
    action: "Indicar responsável",
    cancel: "Voltar",
  },
  SERVICE_ORDER_SCHEDULE_CONFLICT: {
    title: "Conflito com a escala",
    message: "Um responsável desta ordem já está na escala publicada deste horário. Confira a escala antes de seguir.",
    action: "Publicar mesmo assim",
    cancel: "Revisar escala",
  },
  ACCESS_ALREADY_GRANTED: {
    title: "Acesso já concedido",
    message: "Esta pessoa já tem acesso nesta congregação. Nenhum convite novo foi criado. Revise o perfil na lista de acessos.",
    action: "Ver acessos",
    cancel: "Voltar",
  },
  ACCESS_INVITE_OPEN: {
    title: "Convite em aberto",
    message: "Já existe um convite que ainda não foi usado. Reenvie esse convite em vez de criar outro acesso.",
    action: "Reenviar convite",
    cancel: "Voltar",
  },
  CONNECTION_TRAIL_ALREADY_LINKED: {
    title: "Trilha já vinculada",
    message: "Você já está na Trilha da Conexão. Nenhuma matrícula nova foi criada. Acompanhe as etapas atuais.",
    action: "Ver minha trilha",
    cancel: "Voltar",
  },
  CHECK_IN_ALREADY_RECORDED: {
    title: "Presença já registrada",
    message: "Esta inscrição já tinha presença. Nenhum novo check-in foi gravado.",
    action: "Concluir",
    cancel: "Voltar",
  },
  LEDGER_POSSIBLE_DUPLICATE: {
    title: "Possível lançamento repetido",
    message: "Há um lançamento com a mesma data, descrição e valor. Continue somente se for outro movimento e registre a justificativa.",
    action: "Registrar com justificativa",
    cancel: "Revisar lançamento",
  },
};

/** Campo que o cliente reenvia depois da confirmação. Ausente quando a ação não pode seguir. */
export const ACKNOWLEDGE_FIELD: Partial<Record<PreventiveCode, string>> = {
  PERSON_POSSIBLE_HOMONYM: "acknowledgeHomonym",
  FAMILY_MOVE_REQUIRED: "confirmHouseholdMove",
  SERVICE_ORDER_SCHEDULE_CONFLICT: "acknowledgeScheduleConflict",
  LEDGER_POSSIBLE_DUPLICATE: "duplicateJustification",
};

export type PreventiveDecision = {
  action: "allow" | "conflict";
  code?: PreventiveCode;
  existing?: PreventiveExisting;
  /** Impede continuar mesmo com confirmação. Configuração não transforma homônimo nisto. */
  blocking?: boolean;
  justification?: string;
};

export function cpfDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Dígitos verificadores do CPF. Rejeita sequência repetida. Não armazena o número. */
export function isValidCpf(value: string): boolean {
  const digits = cpfDigits(value);
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

export function normalizePersonName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
}

/** Só o booleano falso desliga o aviso. Qualquer outro valor mantém o aviso e nunca vira bloqueio. */
export function homonymWarningEnabled(value: unknown): boolean {
  return value !== false;
}

/** Só "block" impede. "off" e valores desconhecidos continuam pedindo confirmação. */
export function scheduleMode(value: unknown): "warn" | "block" {
  return value === "block" ? "block" : "warn";
}

export type IdentityDecisionInput = {
  acknowledgeHomonym: boolean;
  homonymWarning: boolean;
  emailHit?: PreventiveExisting | null;
  fingerprintHit?: PreventiveExisting | null;
  homonymHit?: PreventiveExisting | null;
};

export function identityDecision(input: IdentityDecisionInput): PreventiveDecision {
  const exact = input.fingerprintHit ?? input.emailHit;
  if (exact) return { action: "conflict", code: "PERSON_IDENTITY_EXACT", existing: safe(exact), blocking: true };
  if (input.homonymHit && input.homonymWarning && !input.acknowledgeHomonym) {
    return { action: "conflict", code: "PERSON_POSSIBLE_HOMONYM", existing: safe(input.homonymHit), blocking: false };
  }
  return { action: "allow" };
}

export type FamilyLinkInput = {
  people: Array<{ id: string; householdId: string | null }>;
  targetHouseholdId: string;
  confirmMove: boolean;
};

export function familyLinkDecision(input: FamilyLinkInput): PreventiveDecision {
  if (input.people.length > 0 && input.people.every((person) => person.householdId === input.targetHouseholdId)) {
    return { action: "conflict", code: "FAMILY_LINK_EXISTS", existing: { id: input.targetHouseholdId, status: "LINKED" }, blocking: true };
  }
  const moving = input.people.find((person) => person.householdId && person.householdId !== input.targetHouseholdId);
  if (moving && !input.confirmMove) {
    return { action: "conflict", code: "FAMILY_MOVE_REQUIRED", existing: { id: moving.id, status: "OTHER_HOUSEHOLD" }, blocking: false };
  }
  return { action: "allow" };
}

export type ScheduleCommitInput = {
  missingResponsible: boolean;
  conflictRosterId?: string | null;
  mode: unknown;
  acknowledge: boolean;
};

export function scheduleCommitDecision(input: ScheduleCommitInput): PreventiveDecision {
  if (input.missingResponsible) {
    return { action: "conflict", code: "SERVICE_ORDER_MISSING_RESPONSIBLE", blocking: true };
  }
  if (!input.conflictRosterId) return { action: "allow" };
  const mode = scheduleMode(input.mode);
  if (mode === "block" || !input.acknowledge) {
    return {
      action: "conflict",
      code: "SERVICE_ORDER_SCHEDULE_CONFLICT",
      existing: { id: input.conflictRosterId, status: "PUBLISHED" },
      blocking: mode === "block",
    };
  }
  return { action: "allow" };
}

export type LedgerDuplicateInput = {
  review: boolean;
  candidate?: (PreventiveExisting & { description: string; entryDate: string; amountCents: number }) | null;
  duplicateExistingId?: string;
  duplicateJustification?: string;
};

export function ledgerDuplicateDecision(input: LedgerDuplicateInput): PreventiveDecision {
  if (!input.review || !input.candidate) return { action: "allow" };
  const justification = input.duplicateJustification?.trim() ?? "";
  if (input.duplicateExistingId === input.candidate.id && justification.length >= 10 && justification.length <= 500) {
    return { action: "allow", justification };
  }
  return {
    action: "conflict",
    code: "LEDGER_POSSIBLE_DUPLICATE",
    existing: {
      id: input.candidate.id,
      status: input.candidate.status,
    },
    blocking: false,
  };
}

function safe(existing: PreventiveExisting): PreventiveExisting {
  return { id: existing.id, status: existing.status };
}
