import { SITE_COVER_PHOTO, SITE_IDENTITY_PHOTO, SITE_GALLERY_PHOTOS, usesPreviousGallery } from "@idbrf/shared";

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { isAllowedSiteImage } from "./site-media-url";

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
  identity?: { imageUrl: string; alt: string };
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
    imageUrl: SITE_COVER_PHOTO,
  },
  identity: SITE_IDENTITY_PHOTO,
  gallery: {
    title: "A fé tem muitas formas",
    accent: "de se expressar.",
    description: "Louvor, juventude, oração e Palavra. Expressões que traduzem a vida em comunidade e o desejo de caminhar com Deus.",
    items: SITE_GALLERY_PHOTOS,
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
  if (!isAllowedSiteImage(url)) {
    throw new BadRequestException("Imagem deve estar na biblioteca do site ou no armazenamento autorizado da igreja");
  }
  return url;
}
export function parseSiteLayout(value: unknown): SiteLayout {
  const input = record(value);
  if (input.version !== 1) throw new BadRequestException("Versão do editor não suportada");
  const hero = record(input.hero), gallery = record(input.gallery);
  const items = gallery.items;
  const identity = input.identity === undefined ? SITE_IDENTITY_PHOTO : record(input.identity);
  if (!Array.isArray(items) || items.length < 1 || items.length > 8) throw new BadRequestException("A galeria aceita de uma a oito imagens");
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
  const photos = items.map((item, i) => {
    const entry = record(item);
    return {
      title: short(entry.title, "Título da imagem " + i, 55),
      subtitle: short(entry.subtitle, "Legenda da imagem " + i, 80),
      alt: short(entry.alt, "Texto alternativo da imagem " + i, 220),
      imageUrl: validatedSiteImage(entry.imageUrl),
    };
  });
  return {
    version: 1,
    hero: {
      title: short(hero.title, "Título da capa", 110),
      accent: short(hero.accent, "Destaque da capa", 110),
      description: short(hero.description, "Descrição da capa", 500),
      imageUrl: validatedSiteImage(hero.imageUrl === "/images/adoracao-oficial.jpg" ? SITE_COVER_PHOTO : hero.imageUrl),
    },
    identity: { imageUrl: validatedSiteImage(identity.imageUrl), alt: short(identity.alt, "Descrição de Quem somos", 220) },
    gallery: {
      title: short(gallery.title, "Título da galeria", 110),
      accent: short(gallery.accent, "Destaque da galeria", 110),
      description: short(gallery.description, "Descrição da galeria", 500),
      items: usesPreviousGallery(photos) ? SITE_GALLERY_PHOTOS : photos,
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

  private canEdit(actor: AuthUser, pilot:{organizationId:string;churchId:string}): boolean {
    return hasAccess(actor.grants, {
      roleCodes:[ROLE_CODES.EDITOR_SITE,ROLE_CODES.PUBLICADOR_SITE,ROLE_CODES.SECRETARIA,ROLE_CODES.PASTOR,ROLE_CODES.PLATFORM_ADMIN],
      organizationId:pilot.organizationId,churchId:pilot.churchId,
    });
  }

  private canPublish(actor: AuthUser, pilot:{organizationId:string;churchId:string}): boolean {
    return hasAccess(actor.grants,{
      roleCodes:[ROLE_CODES.PUBLICADOR_SITE,ROLE_CODES.PASTOR,ROLE_CODES.PLATFORM_ADMIN],
      organizationId:pilot.organizationId,churchId:pilot.churchId,
    });
  }

  private async scope(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    if (!this.canEdit(actor, pilot)) {
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
      permissions:{canEdit:true,canPublish:this.canPublish(actor,pilot)},
      published: live ? decodeLayout(live.body) : null,
      draftUpdatedAt: draft?.updatedAt.toISOString() ?? null,
      publishedAt: live?.publishedAt?.toISOString() ?? null,
      revisions: revisions.map(r => ({ id: r.id, date: r.createdAt.toISOString(), actorUserId: r.actorUserId, note: r.note })),
    };
  }

  async saveDraft(actor: AuthUser, input: unknown, expectedUpdatedAt?: string | null) {
    const pilot = await this.scope(actor);
    const value = parseSiteLayout(input);
    const snapshot = JSON.stringify(value);
    try {
      const row = await this.prisma.$transaction(async tx => {
        const existing = await tx.cmsContent.findUnique({
          where: { churchId_slug: { churchId: pilot.churchId, slug: DRAFT_SLUG } },
        });
        if (expectedUpdatedAt !== undefined && (existing?.updatedAt.toISOString() ?? null) !== expectedUpdatedAt) {
          throw new ConflictException("Outra pessoa atualizou o rascunho. Recarregue para preservar as alterações.");
        }

        const updated = existing
          ? await (async () => {
              const result = await tx.cmsContent.updateMany({
                where: { id: existing.id, updatedAt: existing.updatedAt },
                data: { body: snapshot, updatedByUserId: actor.userId },
              });
              if (result.count !== 1) throw new ConflictException("Rascunho alterado por outra pessoa");
              return tx.cmsContent.findUniqueOrThrow({ where: { id: existing.id } });
            })()
          : await tx.cmsContent.create({
              data: {
                organizationId: pilot.organizationId, churchId: pilot.churchId, kind: "PAGE",
                slug: DRAFT_SLUG, title: "Gestão da Home — rascunho", body: snapshot,
                status: "RASCUNHO", createdByUserId: actor.userId, updatedByUserId: actor.userId,
              },
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
      }, { isolationLevel: "Serializable" });
      return { draft: value, draftUpdatedAt: row.updatedAt.toISOString() };
    } catch (error) {
      // Atualizações simultâneas / primeira criação simultânea nunca sobrescrevem em silêncio.
      if (error && typeof error === "object" && "code" in error &&
          (error.code === "P2002" || error.code === "P2034")) {
        throw new ConflictException("Outro editor atualizou a página. Recarregue antes de salvar.");
      }
      throw error;
    }
  }

  async publish(actor: AuthUser, expectedUpdatedAt?: string) {
    const pilot = await this.scope(actor);
    if (!this.canPublish(actor,pilot)) throw new ForbiddenException("Você pode editar o site, mas publicar exige um publicador ou pastor.");
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
