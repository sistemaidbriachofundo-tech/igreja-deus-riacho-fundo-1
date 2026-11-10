/**
 * Menu e página inicial por papel.
 * A lista espelha os @Roles já publicados nos controllers.
 * Ela não autoriza nada: o servidor continua respondendo 401/403.
 */

export const BUILTIN_ROLES = [
  "PLATFORM_ADMIN",
  "SECRETARIA",
  "PASTOR",
  "TESOURARIA",
  "LIDER_MINISTERIO",
  "MEMBRO",
  "EDITOR_SITE",
  "PUBLICADOR_SITE",
] as const;

export type BuiltinRole = (typeof BUILTIN_ROLES)[number];

export type AppNavKey =
  | "visao"
  | "membros"
  | "secretaria"
  | "carteirinha"
  | "editorial"
  | "site"
  | "operacao"
  | "tesouraria"
  | "ministerios"
  | "escalas"
  | "atmosfera"
  | "meu-espaco"
  | "demo";

export type NavIcon =
  | "home"
  | "people"
  | "layers"
  | "badge"
  | "activity"
  | "calendar"
  | "book"
  | "settings"
  | "family"
  | "shield";

export type PersonaProbe = {
  method: "GET" | "POST";
  path: string;
  /** Trecho estável do controller, usado para conferir os papéis declarados. */
  source: string;
  marker: string;
};

export type PersonaArea = {
  key: Exclude<AppNavKey, "demo">;
  href: string;
  label: string;
  short: string;
  icon: NavIcon;
  hint: string;
  ribbon: { code: string; title: string; detail: string };
  /** Papéis para os quais a leitura principal não é um 403 previsível. */
  roles: readonly BuiltinRole[];
  probe: PersonaProbe | null;
  limitation?: string;
};

const STAFF_PEOPLE = ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] as const satisfies readonly BuiltinRole[];
const ADMISSIONS = ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] as const satisfies readonly BuiltinRole[];
const CREDENTIALS = ["MEMBRO", "SECRETARIA", "PLATFORM_ADMIN"] as const satisfies readonly BuiltinRole[];
const MINISTRY_LEAD = ["SECRETARIA", "PASTOR", "LIDER_MINISTERIO", "PLATFORM_ADMIN"] as const satisfies readonly BuiltinRole[];
const SITE_EDITORS = ["EDITOR_SITE", "PUBLICADOR_SITE", "SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] as const satisfies readonly BuiltinRole[];
const CMS_CONTENT = ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] as const satisfies readonly BuiltinRole[];
const OWN_ASSIGNMENT = ["SECRETARIA", "PASTOR", "LIDER_MINISTERIO", "PLATFORM_ADMIN", "MEMBRO"] as const satisfies readonly BuiltinRole[];
const OPERATION = ["SECRETARIA", "PASTOR", "LIDER_MINISTERIO", "PLATFORM_ADMIN", "TESOURARIA"] as const satisfies readonly BuiltinRole[];

export const PERSONA_AREAS: readonly PersonaArea[] = [
  {
    key: "visao",
    href: "/app/",
    label: "Início",
    short: "Início",
    icon: "home",
    hint: "O que este perfil acompanha, sem indicadores inventados",
    ribbon: { code: "IGREJA DE DEUS / CHURCH OS", title: "O seu lugar na gestão.", detail: "Cada perfil vê o que o servidor autoriza." },
    roles: BUILTIN_ROLES,
    probe: null,
  },
  {
    key: "membros",
    href: "/app/membros/",
    label: "Membros e famílias",
    short: "Pessoas",
    icon: "people",
    hint: "Consulta de pessoas e famílias no escopo autorizado",
    ribbon: { code: "01 / PESSOAS", title: "Pessoas da comunidade.", detail: "A lista só abre para quem a API deixa consultar." },
    roles: STAFF_PEOPLE,
    probe: { method: "GET", path: "/persons/search", source: "apps/api/src/persons/persons.controller.ts", marker: '@Get("search")' },
  },
  {
    key: "secretaria",
    href: "/app/secretaria/",
    label: "Secretaria",
    short: "Secretaria",
    icon: "layers",
    hint: "Admissão e etapas que a secretaria ou o pastor acompanham",
    ribbon: { code: "02 / JORNADAS", title: "Etapas com cuidado.", detail: "Protocolos visíveis só para o papel que a API aceita." },
    roles: ADMISSIONS,
    probe: { method: "GET", path: "/admissions", source: "apps/api/src/admissions/admissions.controller.ts", marker: "return this.admissions.list" },
  },
  {
    key: "carteirinha",
    href: "/app/membros/carteirinha/",
    label: "Carteirinhas",
    short: "Carteira",
    icon: "badge",
    hint: "A própria credencial, ou a emissão quando o papel é de secretaria",
    ribbon: { code: "03 / IDENTIDADE", title: "Credencial da pessoa.", detail: "Membro consulta a própria. Emissão fica com a secretaria." },
    roles: CREDENTIALS,
    probe: { method: "GET", path: "/credentials/me", source: "apps/api/src/credentials/credentials.controller.ts", marker: '@Get("me")' },
  },
  {
    key: "operacao",
    href: "/app/operacao/",
    label: "Ministérios e operação",
    short: "Ministérios",
    icon: "activity",
    hint: "Módulos do DAS que este papel pode consultar",
    ribbon: { code: "06 / OPERAÇÃO", title: "Módulos do seu papel.", detail: "O painel esconde o módulo cuja API seria 403." },
    roles: OPERATION,
    probe: null,
  },
  {
    key: "ministerios",
    href: "/app/ministerios/",
    label: "Vínculo de ministério",
    short: "Vínculo",
    icon: "family",
    hint: "Equipe e vínculo dos ministérios autorizados para este perfil",
    ribbon: { code: "08 / MINISTÉRIOS", title: "Equipe do ministério.", detail: "A lista mostra só o que este perfil pode abrir." },
    roles: MINISTRY_LEAD,
    limitation: "O vínculo formal ainda não grava: a API responde 501.",
    probe: {
      method: "GET",
      path: "/ministry-scope/:id/formal-memberships",
      source: "apps/api/src/ministries/membership/ministry-scope.controller.ts",
      marker: 'formal-memberships',
    },
  },
  {
    key: "escalas",
    href: "/app/servir/louvor/",
    label: "Escalas de Louvor",
    short: "Louvor",
    icon: "calendar",
    hint: "Lista de escalas no contrato de roster, para liderança e secretaria",
    ribbon: { code: "09 / ESCALAS", title: "Louvor em escala.", detail: "A lista de roster não abre para o membro." },
    roles: MINISTRY_LEAD,
    probe: { method: "GET", path: "/rosters", source: "apps/api/src/ministries/ministries.controller.ts", marker: "return this.ministries.listRosters" },
  },
  {
    key: "atmosfera",
    href: "/app/servir/atmosfera/",
    label: "Escalas de Atmosfera",
    short: "Atmosfera",
    icon: "calendar",
    hint: "Escala de Atmosfera no mesmo contrato de roster",
    ribbon: { code: "09 / ESCALAS", title: "Atmosfera em escala.", detail: "Mesma autorização da lista de roster." },
    roles: MINISTRY_LEAD,
    probe: { method: "GET", path: "/rosters", source: "apps/api/src/ministries/ministries.controller.ts", marker: "return this.ministries.listRosters" },
  },
  {
    key: "meu-espaco",
    href: "/app/servir/meu-espaco/",
    label: "Meu Espaço",
    short: "Eu",
    icon: "badge",
    hint: "Confirma a própria atribuição pelo identificador. Não lista escalas de outras pessoas",
    ribbon: { code: "10 / MEU ESPAÇO", title: "A sua escala.", detail: "Sem lista de outras pessoas." },
    roles: OWN_ASSIGNMENT,
    limitation: "Não há lista da agenda pessoal. A confirmação usa o identificador da própria atribuição.",
    probe: {
      method: "POST",
      path: "/rosters/:assignmentId/confirm",
      source: "apps/api/src/ministries/ministries.controller.ts",
      marker: '":assignmentId/confirm"',
    },
  },
  {
    key: "tesouraria",
    href: "/app/tesouraria/",
    label: "Tesouraria",
    short: "Caixa",
    icon: "shield",
    hint: "Posição sintética do caixa. Sem banco, Pix ou saldo real",
    ribbon: { code: "07 / TESOURARIA", title: "Caixa sintético.", detail: "Somente o papel Tesouraria. Sem banco ou Pix." },
    roles: ["TESOURARIA"],
    limitation: "Banco, Pix e maquininha permanecem fora. Nenhum saldo real é exibido.",
    probe: { method: "GET", path: "/ledger/accounts", source: "apps/api/src/finance/finance.controller.ts", marker: '@Get("accounts")' },
  },
  {
    key: "editorial",
    href: "/app/editorial/",
    label: "Mídia e conteúdo",
    short: "Conteúdo",
    icon: "book",
    hint: "Conteúdos editoriais que secretaria, pastor ou liderança podem consultar",
    ribbon: { code: "04 / COMUNICAÇÃO", title: "Histórias que edificam.", detail: "Conteúdo oficial da igreja." },
    roles: CMS_CONTENT,
    probe: { method: "GET", path: "/cms/contents", source: "apps/api/src/cms/cms.controller.ts", marker: "return this.cms.list" },
  },
  {
    key: "site",
    href: "/app/site/",
    label: "Gestão do site",
    short: "Site",
    icon: "settings",
    hint: "Rascunho e publicação do site para editor, publicador, secretaria ou pastor",
    ribbon: { code: "05 / SITE", title: "O site da igreja.", detail: "A publicação continua decidida pela API." },
    roles: SITE_EDITORS,
    probe: { method: "GET", path: "/cms/site-layout", source: "apps/api/src/cms/site-layout.controller.ts", marker: "return this.site.editor" },
  },
];

export const PERSONA_LABELS: Record<BuiltinRole, string> = {
  PLATFORM_ADMIN: "Administração da plataforma",
  SECRETARIA: "Secretaria",
  PASTOR: "Pastor",
  TESOURARIA: "Tesouraria",
  LIDER_MINISTERIO: "Liderança de ministério",
  MEMBRO: "Membro",
  EDITOR_SITE: "Edição do site",
  PUBLICADOR_SITE: "Publicação do site",
};

export type RailLink = {
  href: string;
  label: string;
  icon: NavIcon;
  external?: boolean;
  roles: readonly BuiltinRole[] | "any";
};

const COMMUNICATION = ["PASTOR", "SECRETARIA", "PLATFORM_ADMIN"] as const satisfies readonly BuiltinRole[];

/** Ferramentas fora do menu principal. O canal só aparece para quem já pode abrir comunicação. */
export const RAIL_LINKS: readonly RailLink[] = [
  { href: "/eventos/", label: "Agenda pública", icon: "calendar", roles: "any" },
  { href: "/", label: "Portal da igreja", icon: "home", roles: "any" },
  { href: "/status/", label: "Evolução do sistema", icon: "activity", roles: ["PLATFORM_ADMIN"] },
  { href: "https://www.youtube.com/@IDBRiachoFundo1", label: "Canal da igreja", icon: "activity", external: true, roles: COMMUNICATION },
];

/** Itens que o grupo Ministérios reúne. A operação continua sendo outro módulo. */
export const MINISTRY_GROUP_KEYS = ["ministerios", "escalas", "atmosfera"] as const;

export type MinistryGroupKey = (typeof MINISTRY_GROUP_KEYS)[number];

export type MinistryNavItem = {
  id: string;
  name: string;
  slug: string;
};

const MINISTRY_LIST_ROLES = ["SECRETARIA", "PASTOR", "LIDER_MINISTERIO", "PLATFORM_ADMIN"] as const satisfies readonly BuiltinRole[];

export const SHELL_RAIL_STORAGE_KEY = "idriacho1.shell.rail";
export const SHELL_MINISTRY_STORAGE_KEY = "idriacho1.shell.ministries";

export function readRailPreference(value: string | null): "expanded" | "collapsed" {
  return value === "collapsed" ? "collapsed" : "expanded";
}

export function readGroupPreference(value: string | null, childActive: boolean): boolean {
  if (value === "open") return true;
  if (value === "closed") return false;
  return childActive;
}

/** A listagem GET /ministries não inclui tesouraria, membro nem edição do site. */
export function canListMinistries(roles: readonly string[], preview = false): boolean {
  if (preview) return true;
  return roles.some(role => (MINISTRY_LIST_ROLES as readonly string[]).includes(role));
}

export function isMinistryGroupKey(key: string): key is MinistryGroupKey {
  return (MINISTRY_GROUP_KEYS as readonly string[]).includes(key);
}

/**
 * Contexto do ministério. Louvor e Atmosfera já têm superfície própria.
 * Os demais apontam para o vínculo com o id devolvido pela API, sem nome fixo no código.
 */
export function ministryContextHref(item: Pick<MinistryNavItem, "id" | "slug">): string {
  const slug = item.slug.trim().toLowerCase();
  if (slug === "louvor" || slug === "louvor-demo") return "/app/servir/louvor/";
  if (slug === "atmosfera") return "/app/servir/atmosfera/";
  return `/app/ministerios/?ministerio=${encodeURIComponent(item.id)}`;
}

/** Aceita só id, nome e slug. Saldo, centro de custo e campos extras não entram no menu. */
export function parseMinistryNav(payload: unknown): MinistryNavItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rows = (payload as { ministries?: unknown }).ministries;
  if (!Array.isArray(rows)) return [];
  const items: MinistryNavItem[] = [];
  const seen = new Set<string>();
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; name?: unknown; slug?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!id || !name || !slug || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, name, slug });
  }
  return items;
}

export type MinistrySubmenuEntry = {
  key: string;
  href: string;
  label: string;
  icon: NavIcon;
};

/**
 * Com a lista da API, o submenu usa esses nomes.
 * O atalho estático some quando o mesmo destino já veio no retorno, para não duplicar Louvor ou Atmosfera.
 * Sem lista, permanecem só os atalhos que o papel já podia abrir.
 */
export function ministrySubmenu(
  areas: readonly PersonaArea[],
  loaded: readonly MinistryNavItem[] | null,
): MinistrySubmenuEntry[] {
  const apiItems = loaded ?? [];
  const apiHrefs = new Set(apiItems.map(item => ministryContextHref(item)));
  const dynamic = apiItems.map(item => ({
    key: `ministry:${item.id}`,
    href: ministryContextHref(item),
    label: item.name,
    icon: "family" as const,
  }));
  const stable = areas
    .filter(area => isMinistryGroupKey(area.key) && !apiHrefs.has(area.href))
    .map(area => ({ key: area.key, href: area.href, label: area.label, icon: area.icon }));
  return [...dynamic, ...stable];
}

export type AppDestination = "/app/" | "/app/operacao/" | "/app/site/" | "/app/servir/meu-espaco/";

export function landingForRoles(roles: readonly string[]): AppDestination {
  const has = (role: string) => roles.includes(role);
  if (has("LIDER_MINISTERIO") && !has("SECRETARIA") && !has("PASTOR") && !has("TESOURARIA")) {
    return "/app/operacao/";
  }
  const broad = has("SECRETARIA") || has("PASTOR") || has("PLATFORM_ADMIN") || has("TESOURARIA") || has("LIDER_MINISTERIO");
  if ((has("EDITOR_SITE") || has("PUBLICADOR_SITE")) && !broad && !has("MEMBRO")) {
    return "/app/site/";
  }
  if (has("MEMBRO") && !broad && !has("EDITOR_SITE") && !has("PUBLICADOR_SITE")) {
    return "/app/servir/meu-espaco/";
  }
  return "/app/";
}

export function areasForRoles(roles: readonly string[]): PersonaArea[] {
  return PERSONA_AREAS.filter(area => area.key === "visao"
    ? roles.length > 0
    : area.roles.some(role => roles.includes(role)));
}

/** Pré-visualização local, sem homologação: o menu completo continua disponível. */
export function areasForPreview(): PersonaArea[] {
  return [...PERSONA_AREAS];
}

export function areaAllowed(roles: readonly string[], key: string | null | undefined, preview = false): boolean {
  if (preview) return true;
  if (!key) return roles.length > 0;
  if (key === "demo") return false;
  return areasForRoles(roles).some(area => area.key === key);
}

export function railForRoles(roles: readonly string[], preview = false): RailLink[] {
  if (preview) return [...RAIL_LINKS];
  return RAIL_LINKS.filter(link => link.roles === "any" || link.roles.some(role => roles.includes(role)));
}

export function personaLabel(roles: readonly string[]): string {
  const known = BUILTIN_ROLES.filter(role => roles.includes(role));
  if (known.length === 0) return "Perfil autenticado";
  if (known.length <= 2) return known.map(role => PERSONA_LABELS[role]).join(" · ");
  return `${PERSONA_LABELS[known[0]]} · ${PERSONA_LABELS[known[1]]} +${known.length - 2}`;
}

export function accountInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return (letters.slice(0, 2) || "ID").toUpperCase();
}

/** Decisão do RolesGuard: sem usuário 401, papel fora da lista 403, papel na lista 200. */
export function expectedAccessStatus(actorRoles: readonly string[] | null, required: readonly string[]): 200 | 401 | 403 {
  if (actorRoles === null) return 401;
  return required.some(role => actorRoles.includes(role)) ? 200 : 403;
}
