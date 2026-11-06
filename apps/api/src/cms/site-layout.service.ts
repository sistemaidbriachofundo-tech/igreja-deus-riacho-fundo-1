import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canAdministerMinistries } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

/**
 * Editor visual da Home, sobre o CMS já existente. Dois registros separados:
 * rascunho editável e versão aprovada. Um PATCH nunca altera o site publicado.
 */
const DRAFT_SLUG = "idriacho-home-editor-draft";
const LIVE_SLUG = "idriacho-home-editor-live";
export const RESERVED_SITE_SLUGS = [DRAFT_SLUG, LIVE_SLUG] as const;

type GalleryItem = { title: string; subtitle: string; alt: string; imageUrl: string };
export const SITE_SECTIONS = ["essencia", "ministerios", "galeria", "atmosfera", "visita", "acontece", "videos", "convite"] as const;
type SiteSection = (typeof SITE_SECTIONS)[number];
export type SiteLayout = {
  version: 1;
  hero: { title: string; accent: string; description: string; imageUrl: string };
  gallery: { title: string; accent: string; description: string; items: GalleryItem[] };
  appearance: "dourado" | "verde" | "marfim";
  sections: SiteSection[];
  hidden: SiteSection[];
};

export const DEFAULT_SITE_LAYOUT: SiteLayout = {
  version: 1,
  hero: {
    title: "Sua jornada com Deus",
    accent: "pode começar aqui.",
    description: "Um lugar de acolhimento, fé e propósito para você e sua família. Venha nos conhecer e caminhe com uma comunidade que cresce e serve junta.",
    imageUrl: "/images/adoracao-oficial.jpg",
  },
  gallery: {
    title: "A fé tem muitas formas",
    accent: "de se expressar.",
    description: "Louvor, juventude, oração e Palavra. Expressões que traduzem a vida em comunidade e o desejo de caminhar com Deus.",
    items: [
      { title: "Louvor", subtitle: "Uma expressão de fé", alt: "Homem cantando e com uma das mãos erguidas.", imageUrl: "/images/galeria-louvor.webp" },
      { title: "Juventude", subtitle: "Geração com propósito", alt: "Apresentação artística de jovens no palco.", imageUrl: "/images/galeria-juventude.webp" },
      { title: "Oração", subtitle: "Caminhar uns com os outros", alt: "Pessoas reunidas em oração.", imageUrl: "/images/galeria-oracao.webp" },
      { title: "Palavra", subtitle: "Uma mensagem que inspira", alt: "Homem falando com um microfone.", imageUrl: "/images/galeria-palavra.webp" },
    ],
  },
  appearance: "dourado",
  sections: [...SITE_SECTIONS],
  hidden: [],
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Configuração de página inválida");
  return value as Record<string, unknown>;
}
function short(value: unknown, field: string, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new BadRequestException(field + " inválido ou muito longo");
  return value.trim();
}
export function validatedSiteImage(value: unknown): string {
  const url = short(value, "Imagem", 1600);
  if (/^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash) return url;
  } catch { /* invalid URL */ }
  throw new BadRequestException("Imagem deve estar na biblioteca do site ou em uma URL HTTPS autorizada");
}
export function parseSiteLayout(value: unknown): SiteLayout {
  const input = record(value);
  if (input.version !== 1) throw new BadRequestException("Versão do editor não suportada");
  const hero = record(input.hero), gallery = record(input.gallery);
  const items = gallery.items;
  if (!Array.isArray(items) || items.length !== 4) throw new BadRequestException("A galeria exige quatro imagens");
  if (!["dourado", "verde", "marfim"].includes(String(input.appearance))) throw new BadRequestException("Aparência não permitida");
  const sections = input.sections, hidden = input.hidden;
  const valid = (v: unknown): v is SiteSection => typeof v === "string" && SITE_SECTIONS.includes(v as SiteSection);
  if (!Array.isArray(sections) || sections.length !== SITE_SECTIONS.length ||
      sections.some(v => !valid(v)) || new Set(sections).size !== SITE_SECTIONS.length) {
    throw new BadRequestException("Ordem das seções inválida");
  }
  if (!Array.isArray(hidden) || hidden.some(v => !valid(v)) || new Set(hidden).size !== hidden.length ||
      hidden.includes("convite")) {
    throw new BadRequestException("Não é permitido ocultar o convite final ou repetir seções");
  }
  return {
    version: 1,
    hero: {
      title: short(hero.title, "Título da capa", 110),
      accent: short(hero.accent, "Destaque da capa", 110),
      description: short(hero.description, "Descrição da capa", 500),
      imageUrl: validatedSiteImage(hero.imageUrl),
    },
    gallery: {
      title: short(gallery.title, "Título da galeria", 110),
      accent: short(gallery.accent, "Destaque da galeria", 110),
      description: short(gallery.description, "Descrição da galeria", 500),
      items: items.map((item, i) => {
        const entry = record(item);
        return {
          title: short(entry.title, "Título da imagem " + i, 55),
          subtitle: short(entry.subtitle, "Legenda da imagem " + i, 80),
          alt: short(entry.alt, "Texto alternativo da imagem " + i, 220),
          imageUrl: validatedSiteImage(entry.imageUrl),
        };
      }),
    },
    appearance: input.appearance as SiteLayout["appearance"],
    sections: sections as SiteSection[],
    hidden: hidden as SiteSection[],
  };
}
function decodeLayout(text: string | null): SiteLayout {
  if (!text) return DEFAULT_SITE_LAYOUT;
  try { return parseSiteLayout(JSON.parse(text)); } catch { return DEFAULT_SITE_LAYOUT; }
}

@Injectable()
export class SiteLayoutService {
  constructor(private readonly prisma: PrismaService, private readonly pilot: PilotService) {}

  private async scope(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    if (!canAdministerMinistries(actor.grants, pilot)) {
      throw new ForbiddenException("Somente equipe editorial autorizada pode modificar a Home");
    }
    return pilot;
  }

  async editor(actor: AuthUser) {
    const pilot = await this.scope(actor);
    const rows = await this.prisma.cmsContent.findMany({
      where: { churchId: pilot.churchId, organizationId: pilot.organizationId, slug: { in: [...RESERVED_SITE_SLUGS] } },
    });
    const draft = rows.find(row => row.slug === DRAFT_SLUG);
    const live = rows.find(row => row.slug === LIVE_SLUG);
    const revisions = live ? await this.prisma.cmsContentRevision.findMany({
      where: { contentId: live.id }, orderBy: { createdAt: "desc" }, take: 25,
    }) : [];
    return {
      draft: decodeLayout(draft?.body ?? live?.body ?? null),
      published: live ? decodeLayout(live.body) : null,
      draftUpdatedAt: draft?.updatedAt.toISOString() ?? null,
      publishedAt: live?.publishedAt?.toISOString() ?? null,
      revisions: revisions.map(r => ({ id: r.id, date: r.createdAt.toISOString(), actorUserId: r.actorUserId, note: r.note })),
    };
  }

  async saveDraft(actor: AuthUser, input: unknown, expectedUpdatedAt?: string | null) {
    const pilot = await this.scope(actor);
    const value = parseSiteLayout(input);
    const now = await this.prisma.cmsContent.findUnique({ where: { churchId_slug: { churchId: pilot.churchId, slug: DRAFT_SLUG } } });
    if (expectedUpdatedAt !== undefined && (now?.updatedAt.toISOString() ?? null) !== expectedUpdatedAt) {
      throw new ConflictException("Outra pessoa atualizou o rascunho. Recarregue para preservar as alterações.");
    }
    const snapshot = JSON.stringify(value);
    const row = await this.prisma.$transaction(async tx => {
      const updated = await tx.cmsContent.upsert({
        where: { churchId_slug: { churchId: pilot.churchId, slug: DRAFT_SLUG } },
        create: {
          organizationId: pilot.organizationId, churchId: pilot.churchId, kind: "PAGE",
          slug: DRAFT_SLUG, title: "Gestão da Home — rascunho", body: snapshot,
          status: "RASCUNHO", createdByUserId: actor.userId, updatedByUserId: actor.userId,
        },
        update: { body: snapshot, updatedByUserId: actor.userId },
      });
      await tx.cmsContentRevision.create({ data: {
        contentId: updated.id, fromStatus: "RASCUNHO", toStatus: "RASCUNHO",
        actorUserId: actor.userId, note: "Edição visual (rascunho)", snapshot: value,
      } });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "site.home.draft", resourceType: "cms_content",
        resourceId: updated.id, organizationId: pilot.organizationId, churchId: pilot.churchId,
      } });
      return updated;
    });
    return { draft: value, draftUpdatedAt: row.updatedAt.toISOString() };
  }

  async publish(actor: AuthUser, expectedUpdatedAt?: string) {
    const pilot = await this.scope(actor);
    const draft = await this.prisma.cmsContent.findUnique({ where: { churchId_slug: { churchId: pilot.churchId, slug: DRAFT_SLUG } } });
    if (!draft) throw new NotFoundException("Salve um rascunho antes de publicar");
    if (expectedUpdatedAt && draft.updatedAt.toISOString() !== expectedUpdatedAt) throw new ConflictException("O rascunho foi alterado. Confira antes de publicar.");
    const value = parseSiteLayout(JSON.parse(draft.body ?? "null"));
    const live = await this.prisma.$transaction(async tx => {
      const row = await tx.cmsContent.upsert({
        where: { churchId_slug: { churchId: pilot.churchId, slug: LIVE_SLUG } },
        create: {
          organizationId: pilot.organizationId, churchId: pilot.churchId, kind: "PAGE", slug: LIVE_SLUG,
          title: "Gestão da Home — publicada", status: "PUBLICADO", body: JSON.stringify(value),
          publishedAt: new Date(), createdByUserId: actor.userId, updatedByUserId: actor.userId,
        },
        update: { body: JSON.stringify(value), status: "PUBLICADO", publishedAt: new Date(), updatedByUserId: actor.userId },
      });
      await tx.cmsContentRevision.create({ data: {
        contentId: row.id, fromStatus: "PUBLICADO", toStatus: "PUBLICADO",
        actorUserId: actor.userId, note: "Publicação da Home", snapshot: value,
      } });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "site.home.publish", resourceType: "cms_content",
        resourceId: row.id, organizationId: pilot.organizationId, churchId: pilot.churchId,
      } });
      return row;
    });
    return { published: value, publishedAt: live.publishedAt?.toISOString() ?? null };
  }

  async restore(actor: AuthUser, revisionId: string) {
    const pilot = await this.scope(actor);
    const live = await this.prisma.cmsContent.findUnique({ where: { churchId_slug: { churchId: pilot.churchId, slug: LIVE_SLUG } } });
    if (!live) throw new NotFoundException("Nenhuma versão publicada");
    const revision = await this.prisma.cmsContentRevision.findFirst({ where: { id: revisionId, contentId: live.id } });
    if (!revision) throw new NotFoundException("Revisão não encontrada");
    // Restaura no rascunho para revisão, nunca diretamente na produção.
    const value = parseSiteLayout(revision.snapshot);
    return this.saveDraft(actor, value);
  }

  async published() {
    const pilot = await this.pilot.getPilotChurch();
    const live = await this.prisma.cmsContent.findFirst({
      where: { organizationId: pilot.organizationId, churchId: pilot.churchId, slug: LIVE_SLUG, status: "PUBLICADO" },
    });
    return { layout: live ? decodeLayout(live.body) : null };
  }
}
