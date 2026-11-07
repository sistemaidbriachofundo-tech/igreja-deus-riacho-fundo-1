import { Injectable } from "@nestjs/common";
import { PILOT_CHURCH_NAME } from "@idbrf/shared";
import { RESERVED_SITE_SLUGS } from "../../cms/site-layout.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PilotService } from "../../pilot/pilot.service";
import type {
  InstitutionalKnowledgePack,
  ViviKnowledgeIntent,
  ViviKnowledgeSourceRef,
} from "./vivi-knowledge.types";

const MAX_MINISTRIES = 16;
const MAX_EVENTS = 12;
const MAX_CMS = 16;
const MAX_BODY_CHARS = 400;
const MAX_FACTS_CHARS = 4500;

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "um",
  "uma",
  "para",
  "por",
  "com",
  "que",
  "qual",
  "quais",
  "quando",
  "onde",
  "como",
  "meu",
  "minha",
  "seu",
  "sua",
  "the",
  "is",
  "are",
]);

@Injectable()
export class ViviKnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  /**
   * Retrieval estruturado ANTES do LLM.
   * Só conteúdo publicado/autorizado público da congregação piloto.
   * Sem pastoral, membros, docs internos ou admin drafts.
   */
  async retrieveForQuery(userQuery: string): Promise<InstitutionalKnowledgePack> {
    const pilot = await this.pilot.getPilotChurch();
    const churchId = pilot.churchId;
    const organizationId = pilot.organizationId;
    const churchName = pilot.churchName || PILOT_CHURCH_NAME;
    const intent = classifyIntent(userQuery);
    const tokens = tokenize(userQuery);

    const [ministries, events, cmsRows] = await Promise.all([
      this.prisma.ministry.findMany({
        where: {
          organizationId,
          churchId,
          publishStatus: "PUBLISHED",
          visibility: "PUBLIC",
        },
        orderBy: { name: "asc" },
        take: MAX_MINISTRIES,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          scheduleText: true,
          leadershipPublic: true,
          participationInfo: true,
        },
      }),
      this.prisma.portalEvent.findMany({
        where: {
          organizationId,
          churchId,
          status: "PUBLISHED",
        },
        orderBy: { startsAt: "asc" },
        take: MAX_EVENTS,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          startsAt: true,
          endsAt: true,
          locationText: true,
          featuredOnHome: true,
        },
      }),
      this.prisma.cmsContent.findMany({
        where: {
          organizationId,
          churchId,
          status: "PUBLICADO",
          kind: { in: ["HOME_BLOCK", "PAGE", "NEWS", "BANNER", "MINISTRY_CONTENT"] },
          slug: { notIn: [...RESERVED_SITE_SLUGS] },
        },
        orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }],
        take: MAX_CMS,
        select: {
          id: true,
          kind: true,
          slug: true,
          title: true,
          summary: true,
          body: true,
        },
      }),
    ]);

    type Scored = { score: number; block: string; source: ViviKnowledgeSourceRef };
    const scored: Scored[] = [];

    for (const m of ministries) {
      const leadership = formatLeadership(m.leadershipPublic);
      const hay = [
        m.name,
        m.slug,
        m.description ?? "",
        m.scheduleText ?? "",
        leadership,
        m.participationInfo ?? "",
      ].join(" ");
      const score = scoreMatch(tokens, hay, intent, {
        scheduleBoost: Boolean(m.scheduleText),
        leadershipBoost: Boolean(leadership),
        kind: "ministry",
      });
      if (score <= 0 && intent !== "general" && intent !== "ministries") continue;
      const lines = [
        `Ministério: ${m.name} (slug: ${m.slug})`,
        m.description ? `Descrição: ${clip(m.description, 220)}` : null,
        m.scheduleText ? `Horário/agenda publicada: ${clip(m.scheduleText, 220)}` : null,
        leadership ? `Liderança pública: ${leadership}` : null,
        m.participationInfo
          ? `Participação: ${clip(m.participationInfo, 180)}`
          : null,
      ].filter(Boolean);
      scored.push({
        score: score > 0 ? score : intent === "ministries" || intent === "general" ? 1 : 0,
        block: lines.join("\n"),
        source: { kind: "ministry", id: m.id, slug: m.slug, title: m.name },
      });
    }

    for (const e of events) {
      const hay = [
        e.name,
        e.slug,
        e.description ?? "",
        e.locationText ?? "",
        e.startsAt.toISOString(),
      ].join(" ");
      const score = scoreMatch(tokens, hay, intent, { kind: "event" });
      if (score <= 0 && intent !== "general" && intent !== "events") continue;
      const lines = [
        `Evento: ${e.name} (slug: ${e.slug})`,
        `Início: ${e.startsAt.toISOString()}`,
        e.endsAt ? `Fim: ${e.endsAt.toISOString()}` : null,
        e.locationText ? `Local: ${clip(e.locationText, 160)}` : null,
        e.description ? `Descrição: ${clip(e.description, 220)}` : null,
        e.featuredOnHome ? "Destaque na home: sim" : null,
      ].filter(Boolean);
      scored.push({
        score: score > 0 ? score : intent === "events" || intent === "general" ? 1 : 0,
        block: lines.join("\n"),
        source: { kind: "event", id: e.id, slug: e.slug, title: e.name },
      });
    }

    for (const c of cmsRows) {
      const hay = [c.title, c.slug, c.summary ?? "", c.body ?? "", c.kind].join(" ");
      const score = scoreMatch(tokens, hay, intent, { kind: "cms" });
      if (score <= 0 && intent !== "general" && intent !== "cms") continue;
      const lines = [
        `CMS ${c.kind}: ${c.title} (slug: ${c.slug})`,
        c.summary ? `Resumo: ${clip(c.summary, 220)}` : null,
        c.body ? `Trecho: ${clip(sanitizeCmsText(c.body), MAX_BODY_CHARS)}` : null,
      ].filter(Boolean);
      scored.push({
        score: score > 0 ? score : intent === "cms" || intent === "general" ? 1 : 0,
        block: lines.join("\n"),
        source: { kind: "cms", id: c.id, slug: c.slug, title: c.title },
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const selected = scored.filter((s) => s.score > 0).slice(0, 10);

    const factual =
      intent === "schedule" || intent === "leadership" || intent === "events";
    const missingOfficialData = factual && selected.length === 0;

    let factsText = buildFactsPreamble(churchName, intent, missingOfficialData);
    const sources: ViviKnowledgeSourceRef[] = [];
    for (const item of selected) {
      const next = `${factsText}\n\n---\n${item.block}`;
      if (next.length > MAX_FACTS_CHARS) break;
      factsText = next;
      sources.push(item.source);
    }

    if (selected.length === 0) {
      factsText +=
        "\n\n(Nenhum registro oficial publicado correspondente foi encontrado nesta consulta.)";
    }

    return {
      churchId,
      churchName,
      retrievedAt: new Date().toISOString(),
      refreshPolicy: "live-db-on-each-request",
      intent,
      sources,
      factsText,
      missingOfficialData,
    };
  }
}

function buildFactsPreamble(
  churchName: string,
  intent: ViviKnowledgeIntent,
  missing: boolean,
): string {
  const lines = [
    `FATOS OFICIAIS PUBLICADOS — congregação: ${churchName}`,
    `Intenção detectada: ${intent}`,
    "Use APENAS estes fatos para horários, lideranças públicas, eventos e textos institucionais.",
    "Se o fato não estiver listado, diga claramente que não há informação oficial publicada e oriente a pessoa a confirmar no portal ou com a secretaria.",
    "Nunca invente horários, nomes de líderes, endereços ou eventos.",
  ];
  if (missing) {
    lines.push(
      "ATENÇÃO: pedido factual sem dado oficial correspondente — responda que a informação não está publicada.",
    );
  }
  return lines.join("\n");
}

export function classifyIntent(query: string): ViviKnowledgeIntent {
  const q = query.toLowerCase();
  if (
    /(hor[aá]rio|agenda|culto|reuni[aã]o|quando (come[cç]a|abre|rola)|que horas)/i.test(
      q,
    )
  ) {
    return "schedule";
  }
  if (
    /(l[ií]der|lideran[cç]a|pastor|pastora|coordenador|quem (coordena|lidera|comanda))/i.test(
      q,
    )
  ) {
    return "leadership";
  }
  if (/(evento|programa[cç][aã]o|encontro|confer[eê]ncia|retiro)/i.test(q)) {
    return "events";
  }
  if (/(minist[eé]rio|jovens|adolescentes|mulheres|homens|atmosfera)/i.test(q)) {
    return "ministries";
  }
  if (/(not[ií]cia|p[aá]gina|banner|conte[uú]do|cms|site)/i.test(q)) {
    return "cms";
  }
  return "general";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .slice(0, 24);
}

function scoreMatch(
  tokens: string[],
  haystack: string,
  intent: ViviKnowledgeIntent,
  opts: {
    scheduleBoost?: boolean;
    leadershipBoost?: boolean;
    kind: "ministry" | "event" | "cms";
  },
): number {
  const hay = haystack
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }
  if (intent === "schedule" && opts.kind === "ministry" && opts.scheduleBoost) {
    score += 3;
  }
  if (intent === "leadership" && opts.kind === "ministry" && opts.leadershipBoost) {
    score += 3;
  }
  if (intent === "events" && opts.kind === "event") score += 2;
  if (intent === "ministries" && opts.kind === "ministry") score += 2;
  if (intent === "cms" && opts.kind === "cms") score += 2;
  return score;
}

function formatLeadership(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  const parts: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name =
      typeof row.displayName === "string"
        ? row.displayName.trim()
        : typeof row.name === "string"
          ? row.name.trim()
          : "";
    const role =
      typeof row.roleTitle === "string"
        ? row.roleTitle.trim()
        : typeof row.role === "string"
          ? row.role.trim()
          : "";
    if (!name) continue;
    // Só rótulos públicos — nunca telefone/email/docs.
    parts.push(role ? `${name} (${role})` : name);
  }
  return parts.join("; ");
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Remove ruído de prompt-injection que possa ter entrado em body CMS. */
export function sanitizeCmsText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(
      /(ignore|disregard|esquec[ae]|ignore previous|system prompt|developer message)[^\n.]{0,80}/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}
