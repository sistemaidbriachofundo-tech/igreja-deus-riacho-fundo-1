import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { PublicPortalService } from "../public-portal/public-portal.service";
import { CmsService } from "./cms.service";
import { DEFAULT_SITE_LAYOUT, SiteLayoutService } from "./site-layout.service";

const pilot = {
  organizationId: "org1",
  churchId: "church-rf1",
  organizationSlug: "igreja-de-deus",
  churchSlug: "riacho-fundo-1",
  churchName: "Riacho Fundo I (demo)",
};

const editor: AuthUser = {
  userId: "u-editor",
  personId: "p-editor",
  email: "editor.demo@example.test",
  grants: [{ roleCode: "EDITOR_SITE", organizationId: "org1", churchId: "church-rf1" }],
};
const publisher: AuthUser = {
  userId: "u-pub",
  personId: "p-pub",
  email: "publicador.demo@example.test",
  grants: [{ roleCode: "PUBLICADOR_SITE", organizationId: "org1", churchId: "church-rf1" }],
};
const member: AuthUser = {
  userId: "u-mem",
  personId: "p-mem",
  email: "membro.demo@example.test",
  grants: [{ roleCode: "MEMBRO", organizationId: "org1", churchId: "church-rf1" }],
};
const leader: AuthUser = {
  userId: "u-lid",
  personId: "p-lid",
  email: "lider.demo@example.test",
  grants: [{ roleCode: "LIDER_MINISTERIO", organizationId: "org1", churchId: "church-rf1", ministryId: "m-jovens" }],
};

type Row = Record<string, unknown> & { id: string; updatedAt: Date; createdAt: Date };

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "NOT" && value && typeof value === "object") return !matches(row, value as Record<string, unknown>);
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const filter = value as { in?: unknown[]; notIn?: unknown[] };
      if (filter.in) return filter.in.includes(row[key]);
      if (filter.notIn) return !filter.notIn.includes(row[key]);
    }
    return row[key] === value;
  });
}

function memory() {
  const contents: Row[] = [];
  const revisions: Row[] = [];
  const audits: Row[] = [];
  let seq = 0;
  const next = (prefix: string) => `${prefix}-${++seq}`;
  const contentApi = {
    async create({ data }: { data: Record<string, unknown> }) {
      const now = new Date();
      const row: Row = {
        ministryId: null, summary: null, body: null, imageUrl: null, sortOrder: 0,
        publishedAt: null, ...data, id: next("c"), createdAt: now, updatedAt: now,
      };
      contents.push(row);
      return row;
    },
    async findMany({ where }: { where?: Record<string, unknown> }) {
      return contents.filter((row) => matches(row, where));
    },
    async findFirst({ where }: { where?: Record<string, unknown> }) {
      return contents.find((row) => matches(row, where)) ?? null;
    },
    async findUnique({ where }: { where: { id?: string; churchId_slug?: { churchId: string; slug: string } } }) {
      if (where.id) return contents.find((row) => row.id === where.id) ?? null;
      const key = where.churchId_slug;
      return contents.find((row) => row.churchId === key?.churchId && row.slug === key?.slug) ?? null;
    },
    async findUniqueOrThrow(args: { where: { id: string } }) {
      const row = await contentApi.findUnique(args);
      if (!row) throw new Error("missing");
      return row;
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const row = contents.find((item) => item.id === where.id);
      if (!row) throw new Error("missing");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    async updateMany({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) {
      const row = contents.find((item) => item.id === where.id && item.updatedAt.getTime() === where.updatedAt.getTime());
      if (!row) return { count: 0 };
      Object.assign(row, data, { updatedAt: new Date() });
      return { count: 1 };
    },
    async upsert({ where, create, update }: {
      where: { churchId_slug: { churchId: string; slug: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) {
      const current = await contentApi.findUnique({ where });
      if (!current) return contentApi.create({ data: create });
      return contentApi.update({ where: { id: current.id }, data: update });
    },
  };
  const revisionApi = {
    async create({ data }: { data: Record<string, unknown> }) {
      const row: Row = { ...data, id: next("r"), createdAt: new Date(), updatedAt: new Date() };
      revisions.push(row);
      return row;
    },
    async findMany({ where, orderBy, take }: { where?: { contentId?: string }; orderBy?: { createdAt?: string }; take?: number }) {
      const rows = revisions.filter((row) => !where?.contentId || row.contentId === where.contentId);
      if (orderBy?.createdAt === "desc") rows.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
      return take ? rows.slice(0, take) : rows;
    },
    async findFirst({ where }: { where: { id: string; contentId: string } }) {
      return revisions.find((row) => row.id === where.id && row.contentId === where.contentId) ?? null;
    },
  };
  const client = {
    cmsContent: contentApi,
    cmsContentRevision: revisionApi,
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data as Row); return data; } },
    ministry: { findMany: async () => [] },
    portalEvent: { findMany: async () => [] },
  };
  return {
    client: { ...client, $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client) },
    contents, revisions, audits,
  };
}

describe("CMS institucional — criar, reabrir, publicar e ler", () => {
  const store = memory();
  const pilotService = { getPilotChurch: jest.fn().mockResolvedValue(pilot) };
  const cms = new CmsService(store.client as never, pilotService as never, { enqueueCmsPublishNotify: jest.fn() } as never);
  const site = new SiteLayoutService(store.client as never, pilotService as never);
  const portal = new PublicPortalService(store.client as never, pilotService as never);

  it("percorre o fluxo e esconde rascunho, autores e a Home de produção", async () => {
    await expect(cms.list(member)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(cms.create(leader, { kind: "NEWS", slug: "lider", title: "Não" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(cms.create(editor, {
      kind: "NEWS", slug: "culto-sintetico", title: "Rascunho", body: "nota interna",
      imageUrl: "https://exemplo.test/foto.jpg",
    })).rejects.toBeInstanceOf(BadRequestException);

    const created = await cms.create(editor, {
      kind: "NEWS", slug: "Culto-Sintetico", title: " Rascunho inicial ",
      summary: "prévia", body: "Texto interno do rascunho", imageUrl: "/images/hero-oficial.jpg",
    });
    expect(created.status).toBe("RASCUNHO");
    expect(created.slug).toBe("culto-sintetico");

    await cms.patch(editor, created.id, { title: "Culto de teste", body: "Texto que o leitor pode ver" });
    const reopened = await cms.get(editor, created.id);
    expect(reopened.title).toBe("Culto de teste");
    expect(reopened.body).toBe("Texto que o leitor pode ver");
    expect(reopened.revisions.length).toBeGreaterThanOrEqual(2);

    await expect(portal.getContentBySlug("culto-sintetico")).rejects.toBeInstanceOf(NotFoundException);
    await expect(cms.patch(editor, created.id, { status: "PUBLICADO" })).rejects.toBeInstanceOf(ForbiddenException);
    await cms.patch(editor, created.id, { status: "REVISAO" });
    await expect(cms.patch(editor, created.id, { status: "APROVADO" })).rejects.toBeInstanceOf(ForbiddenException);

    await cms.patch(publisher, created.id, { status: "APROVADO", note: "revisão" });
    const published = await cms.patch(publisher, created.id, { status: "PUBLICADO", note: "publicar" });
    expect(published.status).toBe("PUBLICADO");

    const reader = await portal.getContentBySlug("culto-sintetico");
    expect(reader).toMatchObject({ title: "Culto de teste", body: "Texto que o leitor pode ver", slug: "culto-sintetico" });
    expect(reader).not.toHaveProperty("actorUserId");
    expect(reader).not.toHaveProperty("status");
    expect(reader).not.toHaveProperty("revisions");
    expect(JSON.stringify(reader)).not.toContain("nota interna");
    expect(JSON.stringify(reader)).not.toContain("u-editor");

    await expect(cms.patch(editor, created.id, { title: "Vazou no ar" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(portal.getContentBySlug("culto-sintetico")).resolves.toMatchObject({ title: "Culto de teste" });

    const draftLayout = {
      ...DEFAULT_SITE_LAYOUT,
      hero: { ...DEFAULT_SITE_LAYOUT.hero, title: "Rascunho da capa 5a13" },
    };
    const saved = await site.saveDraft(editor, draftLayout, null);
    expect(saved.draft.hero.title).toBe("Rascunho da capa 5a13");
    await expect(site.published()).resolves.toEqual({ layout: null });
    await expect(site.publish(editor, saved.draftUpdatedAt)).rejects.toBeInstanceOf(ForbiddenException);
    await site.publish(publisher, saved.draftUpdatedAt);
    await expect(site.published()).resolves.toMatchObject({ layout: { hero: { title: "Rascunho da capa 5a13" } } });
    await site.saveDraft(editor, {
      ...draftLayout,
      hero: { ...draftLayout.hero, title: "Ainda só rascunho" },
    }, (await site.editor(editor)).draftUpdatedAt);
    await expect(site.published()).resolves.toMatchObject({ layout: { hero: { title: "Rascunho da capa 5a13" } } });
    await expect(portal.getContentBySlug("idriacho-home-editor-draft")).rejects.toBeInstanceOf(NotFoundException);
    await expect(portal.getContentBySlug("idriacho-home-editor-live")).rejects.toBeInstanceOf(NotFoundException);
    expect(store.audits.map((row) => row.action)).toEqual(expect.arrayContaining(["cms.create", "cms.patch", "site.home.draft", "site.home.publish"]));
  });
});
