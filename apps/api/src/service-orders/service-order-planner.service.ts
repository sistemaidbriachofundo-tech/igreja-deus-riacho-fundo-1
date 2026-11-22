import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import {
  RF1_SERVICE_ORDER_DEFAULTS, buildServiceMoments, chooseRoleCandidate, localDayGap, monthServiceDates,
  parseOrderRules, type Candidate, type ServiceOrderRules, type ServingHistory,
} from "./service-order-planning.domain";

const DAY_MS = 86_400_000;
type Scope = { churchId: string; organizationId: string };
type MonthInput = { year: number; month: number };
type PreviewRow = {
  serviceAt: string; title: string; alreadyExists: boolean; sourceRosterIds: string[];
  items: ReturnType<typeof buildServiceMoments>; warnings: string[];
};

@Injectable()
export class ServiceOrderPlannerService {
  constructor(private readonly prisma: PrismaService, private readonly pilot: PilotService) {}

  private async scope(actor: AuthUser, write = false): Promise<Scope> {
    const p = await this.pilot.getPilotChurch();
    const scope = { churchId: p.churchId, organizationId: p.organizationId };
    if ((actor.churchId && actor.churchId !== p.churchId) ||
      (actor.organizationId && actor.organizationId !== p.organizationId) ||
      !hasAccess(actor.grants, { ...scope, roleCodes: write ? [ROLE_CODES.PASTOR] :
        [ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN] })) {
      throw new ForbiddenException(write
        ? "Somente o pastor designado configura ou gera Ordens de Culto."
        : "Sem acesso ao planejamento desta congregação.");
    }
    return scope;
  }

  private async policy(scope: Scope): Promise<{ rules: ServiceOrderRules; updatedAt: string | null }> {
    const item = await this.prisma.serviceOrderPolicy.findUnique({ where: { churchId: scope.churchId } });
    return { rules: item ? parseOrderRules(item.rules) : RF1_SERVICE_ORDER_DEFAULTS,
      updatedAt: item?.updatedAt.toISOString() ?? null };
  }

  async getRules(actor: AuthUser) {
    const scope = await this.scope(actor);
    return { churchId: scope.churchId, ...await this.policy(scope) };
  }

  async saveRules(actor: AuthUser, value: unknown, expectedUpdatedAt?: string | null) {
    const scope = await this.scope(actor, true);
    const rules = parseOrderRules(value);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT id FROM churches WHERE id = ${scope.churchId} FOR UPDATE`;
      const current = await tx.serviceOrderPolicy.findUnique({ where: { churchId: scope.churchId } });
      if (expectedUpdatedAt !== undefined && (current?.updatedAt.toISOString() ?? null) !== expectedUpdatedAt) {
        throw new ConflictException("As regras foram alteradas por outra pessoa. Atualize antes de salvar.");
      }
      const result = await tx.serviceOrderPolicy.upsert({
        where: { churchId: scope.churchId },
        create: { churchId: scope.churchId, organizationId: scope.organizationId,
          updatedByUserId: actor.userId, rules },
        update: { rules, updatedByUserId: actor.userId },
      });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "service_order.rules.update",
        resourceType: "service_order_policy", resourceId: result.churchId,
        organizationId: scope.organizationId, churchId: scope.churchId,
        metadata: { minIntervalDays: rules.minIntervalDays, maxMonthlyAssignments: rules.maxMonthlyAssignments,
          services: rules.services.length },
      } });
      return { churchId: scope.churchId, rules, updatedAt: result.updatedAt.toISOString() };
    });
  }

  async previewMonth(actor: AuthUser, input: MonthInput) {
    const scope = await this.scope(actor);
    return this.buildPreview(scope, input);
  }

  private async buildPreview(scope: Scope, input: MonthInput) {
    const config = await this.policy(scope);
    const services = monthServiceDates(input.year, input.month, config.rules);
    const first = new Date(services[0].serviceAt), last = new Date(services[services.length - 1].serviceAt);
    const range = { gte: new Date(+first - 3 * 60 * 60 * 1000), lt: new Date(+last + 3 * 60 * 60 * 1000) };
    const monthKey = String(input.year) + "-" + String(input.month).padStart(2,"0");
    const [rosters, existing, oldMoments] = await Promise.all([
      this.prisma.roster.findMany({
        where: { churchId: scope.churchId, status: "PUBLISHED", serviceAt: range },
        include: { slots: { include: { assignments: {
          where: { status: { in: config.rules.requireConfirmedRoster ? ["CONFIRMED"] : ["CONFIRMED", "PENDING"] } },
          include: { person: { select: { id: true, displayName: true } } },
        } } } },
      }),
      this.prisma.serviceOrder.findMany({ where: { churchId: scope.churchId, serviceAt: range },
        select: { id: true, serviceAt: true } }),
      this.prisma.serviceOrderItem.findMany({
        where: { order: { churchId: scope.churchId,
          serviceAt: { gte: new Date(+first - 365 * DAY_MS), lt: new Date(+last + DAY_MS) } },
          responsiblePersonId: { not: null } },
        select: { orderId: true, responsiblePersonId: true, title: true,
          order: { select: { serviceAt: true } } },
      }),
    ]);
    const personIds = [...new Set(rosters.flatMap(r=>r.slots.flatMap(s=>s.assignments.map(a=>a.personId))))];
    const [preferences, impediments, weekly, response] = await Promise.all([
      this.prisma.volunteerServingPreference.findMany({ where: { churchId: scope.churchId, personId: { in: personIds } } }),
      this.prisma.volunteerImpediment.findMany({ where: { churchId: scope.churchId, personId: { in: personIds },
        startsAt: { lte: last }, endsAt: { gte: first } } }),
      this.prisma.volunteerAvailability.findMany({ where: { churchId: scope.churchId,
        personId: { in: personIds }, active: true } }),
      this.prisma.rosterAvailabilityResponse.findMany({ where: { churchId: scope.churchId,
        personId: { in: personIds }, month: monthKey } }),
    ]);
    const preferenceByPerson = new Map(preferences.map(x=>[x.personId,x]));
    const responseByPerson = new Map(response.map(x=>[x.personId,x.rosterIds]));
    const historical: ServingHistory[] = [];
    const seen = new Set<string>();
    for (const row of oldMoments) {
      if (!row.responsiblePersonId) continue;
      const date = row.order.serviceAt.toISOString();
      const id = row.orderId + "|" + row.responsiblePersonId;
      if (seen.has(id)) continue;
      seen.add(id);
      historical.push({ personId: row.responsiblePersonId, serviceAt: date, role: row.title });
    }
    const isEligible = (personId: string, at: string, rosterId: string) => {
      if (!config.rules.respectAvailability) return true;
      const target = new Date(at), parts = new Intl.DateTimeFormat("en-US", {
        timeZone:"America/Sao_Paulo", day:"2-digit", weekday:"short", hour:"2-digit", hourCycle:"h23",
      }).formatToParts(target);
      const fields = Object.fromEntries(parts.map(x=>[x.type,x.value]));
      const hour = Number(fields.hour), day = Number(fields.day);
      const pref = preferenceByPerson.get(personId);
      if (pref?.onlyMorning && hour >= 12 || pref?.onlyEvening && hour < 12 ||
        pref?.onlyFirstSunday && fields.weekday==="Sun" && day>7 ||
        pref?.onlySecondSunday && fields.weekday==="Sun" && (day<8 || day>14)) return false;
      if (impediments.some(x=>x.personId===personId && x.startsAt<=target && x.endsAt>=target)) return false;
      const selectedRosters = responseByPerson.get(personId);
      if (selectedRosters && !selectedRosters.includes(rosterId)) return false;
      const windows = weekly.filter(x=>x.personId===personId);
      if (windows.length) {
        const weekday = target.getUTCDay();
        const minute = target.getUTCHours()*60+target.getUTCMinutes();
        if (!windows.some(x=>x.weekday===weekday && minute>=x.startMinute && minute<x.endMinute)) return false;
      }
      return true;
    };
    const rows: PreviewRow[] = services.map(item=>{
      const time = +new Date(item.serviceAt);
      const matched = rosters.filter(r=>Math.abs(+r.serviceAt-time)<=90*60*1000);
      const candidates: Candidate[] = matched.flatMap(r=>r.slots.flatMap(slot=>slot.assignments.map(a=>({
        personId:a.personId,displayName:a.person.displayName,roleLabel:slot.roleLabel,rosterId:r.id,
        status:a.status==="CONFIRMED"?"CONFIRMED" as const:"PENDING" as const,
      }))));
      const chosen = new Set<string>();
      const director = chooseRoleCandidate("director",item.serviceAt,candidates,historical,chosen,config.rules,isEligible);
      if (director) chosen.add(director.personId);
      const preacher = chooseRoleCandidate("preacher",item.serviceAt,candidates,historical,chosen,config.rules,isEligible);
      if (preacher) chosen.add(preacher.personId);
      const praise = chooseRoleCandidate("praise",item.serviceAt,candidates,historical,new Set(),config.rules,isEligible);
      const welcome = chooseRoleCandidate("welcome",item.serviceAt,candidates,historical,new Set(),config.rules,isEligible);
      const items = buildServiceMoments(director,preacher,praise,welcome,config.rules);
      const warnings: string[] = [];
      if (!matched.length) warnings.push("Nenhuma escala publicada compatível com este horário.");
      if (!director) warnings.push("Direção sem pessoa confirmada e elegível: atribuição manual.");
      if (!preacher) warnings.push("Pregação sem pessoa confirmada e elegível: atribuição manual.");
      if (!praise) warnings.push("Ministro de louvor não identificado na escala.");
      if (!welcome) warnings.push("Acolhimento sem responsável confirmado.");
      if (config.rules.blessing!=="PREACHER") warnings.push("Definir o responsável pela bênção apostólica.");
      const alreadyExists = existing.some(order=>+order.serviceAt===time);
      // Registra cada participação uma vez por culto para balancear os próximos cultos, sem contar múltiplos momentos.
      for (const id of new Set(items.map(x=>x.responsiblePersonId).filter((x):x is string=>Boolean(x)))) {
        if (!alreadyExists) historical.push({personId:id,serviceAt:item.serviceAt,role:"OC planejada"});
      }
      return {serviceAt:item.serviceAt,title:item.title,alreadyExists,
        sourceRosterIds:matched.map(r=>r.id),items,warnings};
    });
    return {churchId:scope.churchId,year:input.year,month:input.month,policy:config,
      rows,summary:{total:rows.length,existing:rows.filter(r=>r.alreadyExists).length,
        proposed:rows.filter(r=>!r.alreadyExists).length,withWarnings:rows.filter(r=>r.warnings.length).length}};
  }

  async generateMonth(actor: AuthUser, input: MonthInput & { expectedPolicyUpdatedAt?: string | null }) {
    const scope = await this.scope(actor,true);
    // Preview usa somente dados privados do escopo e gera rascunhos, nunca publica automaticamente.
    const plan = await this.buildPreview(scope,input);
    if (input.expectedPolicyUpdatedAt !== undefined &&
        input.expectedPolicyUpdatedAt !== plan.policy.updatedAt) {
      throw new ConflictException("As regras mudaram desde a prévia. Recalcule o mês.");
    }
    const result = await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT id FROM churches WHERE id = ${scope.churchId} FOR UPDATE`;
      const created:string[]=[],skipped:string[]=[];
      for(const proposal of plan.rows){
        const target=new Date(proposal.serviceAt);
        const found=await tx.serviceOrder.findFirst({where:{churchId:scope.churchId,serviceAt:target},select:{id:true}});
        if(found){skipped.push(found.id);continue;}
        const row=await tx.serviceOrder.create({data:{
          churchId:scope.churchId,organizationId:scope.organizationId,
          title:proposal.title,serviceAt:target,status:"DRAFT",createdByUserId:actor.userId,
          notes: proposal.warnings.length ? "REVISAR ANTES DE APROVAR: "+proposal.warnings.join(" | ") : "Gerada das escalas publicadas da congregação.",
          items:{create:proposal.items.map((item,position)=>({position,title:item.title,minutes:item.minutes,
            responsible:item.responsible,responsiblePersonId:item.responsiblePersonId,
            microphone:item.microphone??null,equipment:item.equipment??null,notes:item.notes??null}))},
        }});
        created.push(row.id);
      }
      await tx.auditLog.create({data:{
        actorUserId:actor.userId,action:"service_order.month.generate",
        resourceType:"service_order",resourceId:scope.churchId,organizationId:scope.organizationId,
        churchId:scope.churchId,
        metadata:{year:input.year,month:input.month,created:created.length,skipped:skipped.length},
      }});
      return {created:created.length,skipped:skipped.length,ids:created};
    });
    return {...result,previewWarnings:plan.summary.withWarnings};
  }
}
