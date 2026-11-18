import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { localParts } from "./preview-domain/time";

export const CULT_TYPES = ["thursday_evening", "sunday_morning", "sunday_evening", "special_event"] as const;
export type CultType = typeof CULT_TYPES[number];
export const POSITION_LOCATION_FIELDS = ["sector", "zone", "side"] as const;
export type PositionLocation = Partial<Record<typeof POSITION_LOCATION_FIELDS[number], string | null>>;
export type PositionRule = PositionLocation & { label: string; count: number; couple: boolean; qualification?: string };
export type ModuleRules = {
  positions: Partial<Record<CultType, PositionRule[]>>;
  qualifications: Record<string, string[]>;
  volunteerIds?: string[];
  couples: [string, string][];
  minIntervalDays: number;
  maxMonthlyAssignments: number;
  substituteInviteLimit: number;
  substituteInviteHours: number;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
function int(value: unknown, min: number, max: number, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new BadRequestException("Limite de escala inválido.");
  return value;
}

export function readPositionLocation(input: Record<string, unknown>): PositionLocation {
  const location: PositionLocation = {};
  for (const field of POSITION_LOCATION_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (value !== null && (typeof value !== "string" || value.trim().length > 100)) {
      throw new BadRequestException("Setor, zona e lado devem ter até 100 caracteres.");
    }
    location[field] = text(value) || null;
  }
  return location;
}

export function readModuleRules(raw: unknown): ModuleRules {
  const source = record(raw);
  const positions: ModuleRules["positions"] = {};
  for (const type of CULT_TYPES) {
    const rows = record(source.positions)[type];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.length > 30) throw new BadRequestException("Informe até 30 funções por tipo de culto.");
    positions[type] = rows.map(row => {
      const value = record(row);
      const label = text(value.label);
      const qualification = text(value.qualification).toLowerCase();
      if (!label || label.length > 100 || (qualification && !/^[a-z0-9_-]{1,40}$/.test(qualification))) throw new BadRequestException("Posição ou habilitação inválida.");
      return { ...readPositionLocation(value), label, count: int(value.count, 0, 30, 1), couple: value.couple === true, ...(qualification ? { qualification } : {}) };
    });
    if (positions[type].reduce((total, row) => total + row.count, 0) > 100) throw new BadRequestException("Informe até 100 vagas por tipo de culto.");
  }
  const qualifications = Object.fromEntries(Object.entries(record(source.qualifications)).map(([tag, people]) => {
    if (!/^[a-z0-9_-]{1,40}$/.test(tag) || !Array.isArray(people) || people.some(id => !text(id))) throw new BadRequestException("Habilitação inválida.");
    return [tag, [...new Set(people.map(text))]];
  }));
  const volunteers = source.volunteerIds;
  if (volunteers !== undefined && (!Array.isArray(volunteers) || volunteers.some(id => !text(id)))) {
    throw new BadRequestException("A equipe do módulo deve conter integrantes válidos.");
  }
  const volunteerIds = Array.isArray(volunteers) ? [...new Set(volunteers.map(text))] : undefined;
  const pairs = source.couples ?? [];
  if (!Array.isArray(pairs)) throw new BadRequestException("Cadastre os casais em pares.");
  const used = new Set<string>();
  const couples = pairs.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new BadRequestException("Cadastre os casais em pares.");
    const [a, b] = pair.map(text);
    if (!a || !b || a === b || used.has(a) || used.has(b)) throw new BadRequestException("Cada pessoa pode participar de um casal no módulo.");
    used.add(a); used.add(b);
    return [a, b] as [string, string];
  });
  if (volunteerIds && [...Object.values(qualifications).flat(), ...couples.flat()].some(id => !volunteerIds.includes(id))) {
    throw new BadRequestException("Inclua na equipe do módulo todas as pessoas habilitadas ou cadastradas em casais.");
  }
  return { positions, qualifications, couples, ...(volunteerIds ? { volunteerIds } : {}), minIntervalDays: int(source.minIntervalDays, 0, 60, 10), maxMonthlyAssignments: int(source.maxMonthlyAssignments, 1, 31, 3),
    substituteInviteLimit: int(source.substituteInviteLimit, 0, 5, 0), substituteInviteHours: int(source.substituteInviteHours, 1, 72, 12) };
}

export function isModuleVolunteer(rules: ModuleRules, personId: string): boolean {
  return rules.volunteerIds?.includes(personId) ?? true;
}

export function cultTypeAt(date: Date): CultType {
  const { weekday, minuteOfDay } = localParts(date.toISOString(), "America/Sao_Paulo");
  if (weekday === 4 && minuteOfDay >= 18 * 60) return "thursday_evening";
  if (weekday === 0 && minuteOfDay < 12 * 60) return "sunday_morning";
  if (weekday === 0 && minuteOfDay >= 18 * 60) return "sunday_evening";
  return "special_event";
}

export async function assertSlotEligibility(tx: Prisma.TransactionClient, slot: {
  requiredQualification?: string | null; requiresCouple: boolean;
  roster: { moduleId?: string | null; ministryId: string | null; churchId: string };
}, people: string[]) {
  if (!slot.requiredQualification && !slot.roster.moduleId) return;
  const module = slot.roster.moduleId ? await tx.ministryRosterModule.findFirst({
    where: { id: slot.roster.moduleId, ministryId: slot.roster.ministryId ?? "" }, select: { rules: true },
  }) : null;
  let rules = readModuleRules(module?.rules);
  const links = (tx as unknown as { ministryRosterModuleMembership?: { findMany: (args: unknown) => Promise<Array<{ personId: string }>> } }).ministryRosterModuleMembership;
  if (links?.findMany && slot.roster.moduleId) {
    const rows = await links.findMany({
      where: {
        moduleId: slot.roster.moduleId, status: "ATIVO", endedAt: null,
        person: { status: "ACTIVE" }, membership: { status: "ATIVO", endedAt: null },
      },
      select: { personId: true },
    });
    rules = { ...rules, volunteerIds: [...new Set(rows.map(row => row.personId))] };
  }
  if (!rules.volunteerIds && !slot.requiredQualification && (!slot.requiresCouple || people.length < 2)) return;
  const active = await tx.ministryMembership.count({ where: {
    churchId: slot.roster.churchId, ministryId: slot.roster.ministryId ?? "", status: "ATIVO", personId: { in: people }, person: { status: "ACTIVE" },
  } });
  if (rules.volunteerIds && (active !== people.length || people.some(id => !isModuleVolunteer(rules, id)))) {
    throw new ConflictException({ code: "ROSTER_MODULE_TEAM_REQUIRED", message: "Selecione um integrante ativo da equipe deste módulo." });
  }
  if (slot.requiredQualification) {
    const qualified = rules.qualifications[slot.requiredQualification] ?? [];
    if (active !== people.length || people.some(id => !qualified.includes(id))) throw new ConflictException({ code: "ROSTER_QUALIFICATION_REQUIRED", message: "A posição exige uma habilitação cadastrada no módulo." });
  }
  if (slot.requiresCouple && people.length === 2 && (active !== people.length || !rules.couples.some(pair => people.every(id => pair.includes(id))))) {
    throw new ConflictException({ code: "ROSTER_REGISTERED_COUPLE_REQUIRED", message: "Selecione um casal ativo cadastrado neste módulo." });
  }
}

export async function assertOpenModuleSlot(tx: Prisma.TransactionClient, slot: { id: string; roster: { moduleId?: string | null } }, excludeAssignmentId?: string) {
  if (!slot.roster.moduleId) return;
  const filled = await tx.rosterAssignment.findFirst({ where: { slotId: slot.id, id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined, status: { in: ["PENDING", "CONFIRMED"] } }, select: { id: true } });
  if (filled) throw new ConflictException({ code: "ROSTER_SLOT_FILLED", message: "Esta vaga já foi preenchida." });
}
