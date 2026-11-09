/**
 * Fluxo editorial da prévia W1.
 * A publicação existe só neste estado em memória: o site oficial não é ativado.
 */

export type Persona = "editor" | "publisher";
export type PageId = "inicio" | "quem-somos" | "agenda";
export type DraftStatus = "rascunho" | "em_revisao" | "aprovado" | "publicado";

export type DraftInput = {
  page: PageId;
  title: string;
  summary: string;
  body: string;
  whenLabel: string;
  place: string;
};

export type Draft = DraftInput & {
  id: string;
  status: DraftStatus;
  mediaId: string | null;
  alt: string;
};

export type SnapshotPiece = {
  draftId: string;
  page: PageId;
  title: string;
  summary: string;
  body: string;
  whenLabel: string;
  place: string;
  mediaId: string | null;
  alt: string;
};

export type Version = {
  id: string;
  label: string;
  pieces: SnapshotPiece[];
};

export type MediaAsset = {
  id: string;
  label: string;
  src: string;
  alt: string;
  rightsConfirmed: boolean;
};

export type Studio = {
  drafts: Draft[];
  versions: Version[];
  preview: Version | null;
  officialSiteActivated: false;
  media: readonly MediaAsset[];
};

export type Command =
  | { type: "create"; id: string; input: DraftInput }
  | { type: "update"; id: string; input: DraftInput }
  | { type: "attach-media"; id: string; mediaId: string; rightsAcknowledged: boolean }
  | { type: "submit"; id: string }
  | { type: "withdraw"; id: string }
  | { type: "reject"; id: string }
  | { type: "approve"; id: string }
  | { type: "preview" }
  | { type: "publish" }
  | { type: "rollback" };

export type DispatchResult = {
  ok: boolean;
  studio: Studio;
  message: string;
};

export const PUBLIC_NAV = [
  { id: "inicio", label: "Início" },
  { id: "quem-somos", label: "Quem somos" },
  { id: "agenda", label: "Agenda" },
  { id: "login", label: "Login" },
] as const;

export const STATUS_LABEL: Record<DraftStatus, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  publicado: "Publicado na prévia",
};

const PERSONAL_DATA = [
  { re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, label: "CPF" },
  { re: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, label: "e-mail" },
  { re: /(?:\(?\d{2}\)?\s*)9\d{4}-\d{4}/, label: "telefone" },
  { re: /\b(pix|chave pix|conta corrente|ag[eê]ncia|cart[aã]o de cr[eé]dito)\b/i, label: "dado financeiro" },
];

export const SYNTHETIC_MEDIA: readonly MediaAsset[] = [
  {
    id: "galeria-louvor",
    label: "Louvor ilustrativo",
    src: "/images/galeria-louvor.webp",
    alt: "Pessoas em momento de louvor — imagem ilustrativa",
    rightsConfirmed: true,
  },
  {
    id: "galeria-oracao",
    label: "Oração ilustrativa",
    src: "/images/galeria-oracao.webp",
    alt: "Momento de oração — imagem ilustrativa",
    rightsConfirmed: true,
  },
  {
    id: "galeria-palavra",
    label: "Palavra ilustrativa",
    src: "/images/galeria-palavra.webp",
    alt: "Leitura da Palavra — imagem ilustrativa",
    rightsConfirmed: true,
  },
  {
    id: "sem-cessao",
    label: "Arquivo sem cessão",
    src: "/images/portal-video-art.svg",
    alt: "Arte decorativa sem autorização de uso",
    rightsConfirmed: false,
  },
];

export const EXAMPLE_DRAFT: DraftInput = {
  page: "agenda",
  title: "Encontro de domingo na prévia",
  summary: "Horário sintético usado só para testar o fluxo editorial.",
  body: "Este item existe apenas na prévia isolada e não entra na agenda do site oficial.",
  whenLabel: "Domingo, 10h",
  place: "Templo — ilustrativo",
};

export const EMPTY_DRAFT: DraftInput = {
  page: "agenda",
  title: "",
  summary: "",
  body: "",
  whenLabel: "",
  place: "",
};

const EDITOR_COMMANDS = new Set<Command["type"]>(["create", "update", "attach-media", "submit", "withdraw"]);

export function findPersonalData(text: string): string | null {
  for (const rule of PERSONAL_DATA) {
    if (rule.re.test(text)) return rule.label;
  }
  return null;
}

export function publicNavListsMinistries(): boolean {
  return PUBLIC_NAV.some((item) => /minist/i.test(item.label) || item.id.includes("minister"));
}

export function initialStudio(): Studio {
  return {
    drafts: [],
    preview: null,
    officialSiteActivated: false,
    media: SYNTHETIC_MEDIA,
    versions: [
      {
        id: "v1",
        label: "Linha de base sintética",
        pieces: [
          {
            draftId: "base-inicio",
            page: "inicio",
            title: "Igreja de Deus no Riacho Fundo I",
            summary: "Comunidade de fé, família e serviço.",
            body: "Texto institucional sintético desta prévia. A página oficial do site não é substituída por este conteúdo.",
            whenLabel: "",
            place: "",
            mediaId: "galeria-louvor",
            alt: "Pessoas em momento de louvor — imagem ilustrativa",
          },
          {
            draftId: "base-quem",
            page: "quem-somos",
            title: "Quem somos",
            summary: "Uma igreja local a serviço das famílias.",
            body: "Esta apresentação vive só na prévia isolada. A página Quem somos do site oficial permanece a já publicada.",
            whenLabel: "",
            place: "",
            mediaId: "galeria-palavra",
            alt: "Leitura da Palavra — imagem ilustrativa",
          },
          {
            draftId: "base-agenda-domingo",
            page: "agenda",
            title: "Encontro de domingo",
            summary: "Celebração ilustrativa da linha de base.",
            body: "Horário sintético para a prévia. Não confirma um culto real.",
            whenLabel: "Domingo, 10h",
            place: "Templo — ilustrativo",
            mediaId: null,
            alt: "",
          },
          {
            draftId: "base-agenda-quarta",
            page: "agenda",
            title: "Estudo de meio de semana",
            summary: "Encontro ilustrativo da linha de base.",
            body: "Horário sintético para a prévia. Não confirma um evento real.",
            whenLabel: "Quarta, 19h30",
            place: "Templo — ilustrativo",
            mediaId: null,
            alt: "",
          },
        ],
      },
    ],
  };
}

export function currentVersion(studio: Studio): Version {
  const version = studio.versions[studio.versions.length - 1];
  if (!version) throw new Error("Prévia sem versão de base.");
  return version;
}

export function visibleVersion(studio: Studio, mode: "publicado" | "previa"): Version {
  if (mode === "previa" && studio.preview) return studio.preview;
  return currentVersion(studio);
}

export function pagePiece(version: Version, page: "inicio" | "quem-somos"): SnapshotPiece | undefined {
  return version.pieces.find((piece) => piece.page === page);
}

export function agendaPieces(version: Version): SnapshotPiece[] {
  return version.pieces.filter((piece) => piece.page === "agenda");
}

export function stepIndex(draft: Draft | null, studio: Studio): number {
  if (!draft || draft.status === "rascunho") return 0;
  if (draft.status === "em_revisao") return 1;
  if (draft.status === "aprovado") return studio.preview ? 3 : 2;
  return 4;
}

export function dispatch(studio: Studio, persona: Persona, command: Command): DispatchResult {
  if (persona === "editor" && !EDITOR_COMMANDS.has(command.type)) {
    return fail(studio, "O editor não aprova, não pré-visualiza e não publica. Envie o rascunho ao publicador.");
  }
  if (persona === "publisher" && EDITOR_COMMANDS.has(command.type)) {
    return fail(studio, "O publicador não altera o texto. A edição fica com o editor.");
  }

  switch (command.type) {
    case "create":
      return createDraft(studio, command.id, command.input);
    case "update":
      return updateDraft(studio, command.id, command.input);
    case "attach-media":
      return attachMedia(studio, command.id, command.mediaId, command.rightsAcknowledged);
    case "submit":
      return move(studio, command.id, "rascunho", "em_revisao", "Rascunho enviado para revisão. Ainda não está publicado.");
    case "withdraw":
      return move(studio, command.id, "em_revisao", "rascunho", "Rascunho retirado da revisão.");
    case "reject":
      return move(studio, command.id, "em_revisao", "rascunho", "Conteúdo devolvido ao editor.");
    case "approve":
      return move(studio, command.id, "em_revisao", "aprovado", "Conteúdo aprovado. Monte a prévia antes de publicar.");
    case "preview":
      return buildPreview(studio);
    case "publish":
      return simulatePublish(studio);
    case "rollback":
      return rollback(studio);
    default:
      return fail(studio, "Ação desconhecida.");
  }
}

function createDraft(studio: Studio, id: string, input: DraftInput): DispatchResult {
  const problem = validate(input);
  if (problem) return fail(studio, problem);
  if (studio.drafts.some((draft) => draft.id === id)) return fail(studio, "Identificador de rascunho duplicado.");
  const draft: Draft = { ...normalize(input), id, status: "rascunho", mediaId: null, alt: "" };
  return ok(
    { ...clearPreview(studio), drafts: [...studio.drafts, draft] },
    "Rascunho salvo nesta prévia. O site oficial não foi alterado.",
  );
}

function updateDraft(studio: Studio, id: string, input: DraftInput): DispatchResult {
  const problem = validate(input);
  if (problem) return fail(studio, problem);
  const current = studio.drafts.find((draft) => draft.id === id);
  if (!current) return fail(studio, "Rascunho não encontrado.");
  if (current.status !== "rascunho") return fail(studio, "Só um rascunho pode ser editado. Peça a devolução se ele já seguiu no fluxo.");
  const drafts = studio.drafts.map((draft) =>
    draft.id === id ? { ...draft, ...normalize(input), mediaId: draft.mediaId, alt: draft.alt } : draft,
  );
  return ok({ ...clearPreview(studio), drafts }, "Rascunho atualizado nesta prévia.");
}

function attachMedia(studio: Studio, id: string, mediaId: string, rightsAcknowledged: boolean): DispatchResult {
  const asset = studio.media.find((item) => item.id === mediaId);
  if (!asset) return fail(studio, "Mídia não encontrada na biblioteca sintética.");
  if (!asset.rightsConfirmed || !rightsAcknowledged) {
    return fail(studio, "Confirme o uso ilustrativo. Arquivo sem cessão não entra na prévia.");
  }
  const current = studio.drafts.find((draft) => draft.id === id);
  if (!current) return fail(studio, "Selecione um rascunho para receber a mídia.");
  if (current.status !== "rascunho") return fail(studio, "A mídia só é trocada enquanto o item está em rascunho.");
  const drafts = studio.drafts.map((draft) =>
    draft.id === id ? { ...draft, mediaId: asset.id, alt: asset.alt } : draft,
  );
  return ok({ ...clearPreview(studio), drafts }, "Mídia ilustrativa associada ao rascunho.");
}

function move(
  studio: Studio,
  id: string,
  from: DraftStatus,
  to: DraftStatus,
  message: string,
): DispatchResult {
  const current = studio.drafts.find((draft) => draft.id === id);
  if (!current) return fail(studio, "Rascunho não encontrado.");
  if (current.status !== from) return fail(studio, `Esta ação vale para o estado “${STATUS_LABEL[from]}”.`);
  const drafts = studio.drafts.map((draft) => (draft.id === id ? { ...draft, status: to } : draft));
  return ok({ ...clearPreview(studio), drafts }, message);
}

function buildPreview(studio: Studio): DispatchResult {
  if (!studio.drafts.some((draft) => draft.status === "aprovado")) {
    return fail(studio, "Aprove ao menos um item antes de montar a prévia.");
  }
  const preview: Version = {
    id: "preview",
    label: "Prévia ainda não publicada",
    pieces: overlay(currentVersion(studio).pieces, studio.drafts),
  };
  return ok({ ...studio, preview, officialSiteActivated: false }, "Prévia montada. Nada foi publicado no site oficial.");
}

function simulatePublish(studio: Studio): DispatchResult {
  if (!studio.preview) return fail(studio, "Abra a prévia antes da publicação simulada.");
  const pieces = studio.preview.pieces;
  const visibleIds = new Set(pieces.map((piece) => piece.draftId));
  const version: Version = {
    id: `v${studio.versions.length + 1}`,
    label: `Publicação simulada ${studio.versions.length + 1}`,
    pieces,
  };
  const drafts = studio.drafts.map((draft) =>
    draft.status === "aprovado" && visibleIds.has(draft.id) ? { ...draft, status: "publicado" as const } : draft,
  );
  return ok(
    { ...studio, drafts, versions: [...studio.versions, version], preview: null, officialSiteActivated: false },
    "Publicação simulada nesta prévia. O site público oficial permanece inativo.",
  );
}

function rollback(studio: Studio): DispatchResult {
  if (studio.versions.length < 2) return fail(studio, "Não há versão anterior para restaurar.");
  const popped = studio.versions[studio.versions.length - 1]!;
  const versions = studio.versions.slice(0, -1);
  const restored = versions[versions.length - 1]!;
  const removed = new Set(
    popped.pieces.filter((piece) => !restored.pieces.some((item) => item.draftId === piece.draftId)).map((piece) => piece.draftId),
  );
  const drafts = studio.drafts.map((draft) =>
    removed.has(draft.id) && draft.status === "publicado" ? { ...draft, status: "aprovado" as const } : draft,
  );
  return ok(
    { ...studio, versions, drafts, preview: null, officialSiteActivated: false },
    "Versão anterior restaurada na prévia. O site oficial não foi alterado.",
  );
}

function overlay(base: SnapshotPiece[], drafts: Draft[]): SnapshotPiece[] {
  const pieces = base.map((piece) => ({ ...piece }));
  for (const draft of drafts) {
    if (draft.status !== "aprovado") continue;
    const snap = toSnapshot(draft);
    if (draft.page === "agenda") {
      const index = pieces.findIndex((piece) => piece.draftId === draft.id);
      if (index >= 0) pieces[index] = snap;
      else pieces.push(snap);
    } else {
      const index = pieces.findIndex((piece) => piece.page === draft.page);
      if (index >= 0) pieces[index] = snap;
      else pieces.push(snap);
    }
  }
  return pieces;
}

function toSnapshot(draft: Draft): SnapshotPiece {
  return {
    draftId: draft.id,
    page: draft.page,
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    whenLabel: draft.whenLabel,
    place: draft.place,
    mediaId: draft.mediaId,
    alt: draft.alt,
  };
}

function validate(input: DraftInput): string | null {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const body = input.body.trim();
  if (title.length < 3 || title.length > 90) return "O título precisa ter entre 3 e 90 caracteres.";
  if (summary.length < 8 || summary.length > 180) return "O resumo precisa ter entre 8 e 180 caracteres.";
  if (body.length < 12 || body.length > 800) return "O texto precisa ter entre 12 e 800 caracteres.";
  if (input.page !== "inicio" && input.page !== "quem-somos" && input.page !== "agenda") return "Página inválida.";
  if (input.page === "agenda" && (!input.whenLabel.trim() || !input.place.trim())) {
    return "A agenda precisa de horário e local ilustrativos.";
  }
  const personal = findPersonalData([title, summary, body, input.whenLabel, input.place].join("\n"));
  if (personal) return `Remova o ${personal} antes de salvar. Esta prévia não guarda dado pessoal.`;
  return null;
}

function normalize(input: DraftInput): DraftInput {
  return {
    page: input.page,
    title: input.title.trim(),
    summary: input.summary.trim(),
    body: input.body.trim(),
    whenLabel: input.whenLabel.trim(),
    place: input.place.trim(),
  };
}

function clearPreview(studio: Studio): Studio {
  return { ...studio, preview: null };
}

function ok(studio: Studio, message: string): DispatchResult {
  return { ok: true, studio: { ...studio, officialSiteActivated: false }, message };
}

function fail(studio: Studio, message: string): DispatchResult {
  return { ok: false, studio, message };
}
