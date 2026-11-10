/**
 * Catálogo da rodada #153 / epic #144.
 * SG-T01..T26 e UX-01..UX-06 são reexecutados na URL oficial.
 * UX-V01..UX-V18 são as hipóteses de apresentação a validar no NOSSO site.
 * O docx interno da auditoria V2 não está no repositório e não é publicado aqui;
 * os dezoito itens abaixo são os critérios testáveis nomeados no epic #144.
 */

export const PAGES_URL = "https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/";
export const API_URL = "https://id-riacho1-api-hml.vercel.app";

export const PERSONAS = [
  { id: "ADMIN", email: "platform.demo@example.test", role: "PLATFORM_ADMIN", seeded: true },
  { id: "SECRETARIA", email: "ana.demo@example.test", role: "SECRETARIA", seeded: true },
  { id: "PASTOR", email: "pastor.demo@example.test", role: "PASTOR", seeded: true },
  { id: "TESOURARIA", email: "tesouraria.demo@example.test", role: "TESOURARIA", seeded: true },
  { id: "LIDER", email: "lider.jovens.demo@example.test", role: "LIDER_MINISTERIO", seeded: true },
  { id: "MEMBRO", email: "bruno.demo@example.test", role: "MEMBRO", seeded: true },
  { id: "EDITOR", email: "editor.demo@example.test", role: "EDITOR_SITE", seeded: true },
  { id: "PUBLICADOR", email: "publicador.demo@example.test", role: "PUBLICADOR_SITE", seeded: false },
];

export const VIEWPORTS = [320, 360, 390, 768, 1024, 1440, 1920];
export const SHOT_WIDTHS = [320, 390, 768, 1440];

export const SURFACES = [
  { id: "home", path: "/", label: "Início" },
  { id: "quem-somos", path: "/a-igreja/", label: "Quem somos" },
  { id: "agenda", path: "/eventos/", label: "Agenda" },
  { id: "login", path: "/login/", label: "Login" },
  { id: "painel", path: "/app/", label: "Painel" },
  { id: "membros", path: "/app/membros/", label: "Membros" },
  { id: "secretaria", path: "/app/secretaria/", label: "Secretaria" },
  { id: "carteirinha", path: "/app/membros/carteirinha/", label: "Carteirinha" },
  { id: "ministerios-publicos", path: "/ministerios/", label: "Ministérios públicos" },
  { id: "homens", path: "/ministerios/homens/", label: "Homens" },
  { id: "ministerios-internos", path: "/app/ministerios/", label: "Vínculo de ministério" },
  { id: "tesouraria", path: "/app/tesouraria/", label: "Tesouraria" },
  { id: "meu-espaco", path: "/app/servir/meu-espaco/", label: "Meu Espaço" },
  { id: "editorial", path: "/app/editorial/", label: "Editorial" },
  { id: "operacao", path: "/app/operacao/", label: "Operação" },
];

export const AUTH_ROUTES = [
  "/app/",
  "/app/membros/",
  "/app/secretaria/",
  "/app/membros/carteirinha/",
  "/app/ministerios/",
  "/app/tesouraria/",
  "/app/servir/meu-espaco/",
  "/app/editorial/",
];

/** Leituras que exigem sessão. 200 anônimo é falha de autorização. */
export const PROTECTED_GETS = [
  "/auth/me",
  "/persons/search?q=Ana&limit=1",
  "/memberships",
  "/ledger/accounts",
  "/ledger/entries",
  "/cms/contents",
  "/events",
  "/ministries",
  "/rosters",
  "/credentials/me",
  "/pastoral-cases",
  "/indicators/summary",
];

export const CHECKS = [
  { id: "SG-T01", group: "SG", title: "Home oficial responde e identifica a igreja", critical: true },
  { id: "SG-T02", group: "SG", title: "Menu público limitado a Início, Quem somos, Agenda e Login", critical: true },
  { id: "SG-T03", group: "SG", title: "API HML /health", critical: true },
  { id: "SG-T04", group: "SG", title: "Pages release.json e API /meta no mesmo sourceSha", critical: true },
  { id: "SG-T05", group: "SG", title: "Login das 8 personas sintéticas", critical: true },
  { id: "SG-T06", group: "SG", title: "Rotas protegidas sem sessão respondem 401", critical: true },
  { id: "SG-T07", group: "SG", title: "Matriz 403 por persona", critical: true },
  { id: "SG-T08", group: "SG", title: "Secretaria busca pessoa", critical: true },
  { id: "SG-T09", group: "SG", title: "Secretaria edita e reabre o mesmo personId", critical: true },
  { id: "SG-T10", group: "SG", title: "Clique em carteirinha abre a credencial", critical: true },
  { id: "SG-T11", group: "SG", title: "Carteirinha frente, verso, PDF e QR", critical: true },
  { id: "SG-T12", group: "SG", title: "Revogação de credencial e QR inválido", critical: true },
  { id: "SG-T13", group: "SG", title: "Vínculo formal pessoa → ministério", critical: true },
  { id: "SG-T14", group: "SG", title: "Escala do ministério", critical: true },
  { id: "SG-T15", group: "SG", title: "Meu Espaço confirma ou recusa a própria escala", critical: true },
  { id: "SG-T16", group: "SG", title: "Evento criado e publicado", critical: false },
  { id: "SG-T17", group: "SG", title: "Inscrição em evento", critical: false },
  { id: "SG-T18", group: "SG", title: "Check-in", critical: false },
  { id: "SG-T19", group: "SG", title: "Relatório CSV ou PDF de presença", critical: false },
  { id: "SG-T20", group: "SG", title: "CMS salva rascunho", critical: false },
  { id: "SG-T21", group: "SG", title: "Editor recebe 403 ao publicar; publicador publica", critical: true },
  { id: "SG-T22", group: "SG", title: "Tesouraria idempotente sem lançamento duplicado", critical: true },
  { id: "SG-T23", group: "SG", title: "Tesouraria 403 para quem não é do caixa", critical: true },
  { id: "SG-T24", group: "SG", title: "Nenhum envio externo de mensagem ou Pix", critical: true },
  { id: "SG-T25", group: "SG", title: "Dashboards mostram números vindos da API", critical: true },
  { id: "SG-T26", group: "SG", title: "Sair encerra a sessão", critical: true },
  { id: "UX-01", group: "UX", title: "Início: contraste e reflow", critical: false },
  { id: "UX-02", group: "UX", title: "Quem somos", critical: false },
  { id: "UX-03", group: "UX", title: "Agenda", critical: false },
  { id: "UX-04", group: "UX", title: "Login publicado", critical: false },
  { id: "UX-05", group: "UX", title: "Gate de /app/secretaria sem sessão", critical: true },
  { id: "UX-06", group: "UX", title: "Erro de credencial não ecoa a senha", critical: true },
  { id: "UX-V01", group: "UX-V", title: "Sidebar recolhe, persiste e expande", critical: true },
  { id: "UX-V02", group: "UX-V", title: "Ministérios expande até Homens", critical: true },
  { id: "UX-V03", group: "UX-V", title: "Sair discreto no shell autenticado", critical: true },
  { id: "UX-V04", group: "UX-V", title: "Canais de Comunicação fora do menu principal", critical: false },
  { id: "UX-V05", group: "UX-V", title: "Telas usuais sem demo, roster, endpoint ou schema", critical: true },
  { id: "UX-V06", group: "UX-V", title: "Homologação identificada com discrição", critical: false },
  { id: "UX-V07", group: "UX-V", title: "Frente da carteirinha abre ao clique", critical: true },
  { id: "UX-V08", group: "UX-V", title: "Verso da carteirinha", critical: true },
  { id: "UX-V09", group: "UX-V", title: "PDF da carteirinha", critical: true },
  { id: "UX-V10", group: "UX-V", title: "QR da carteirinha", critical: true },
  { id: "UX-V11", group: "UX-V", title: "Dashboard com números da API, sem saldo ilustrado como real", critical: true },
  { id: "UX-V12", group: "UX-V", title: "Sem rolagem horizontal de 320 a 1920", critical: false },
  { id: "UX-V13", group: "UX-V", title: "Alvos de toque com 44 px", critical: false },
  { id: "UX-V14", group: "UX-V", title: "Contraste de texto comum ≥ 4,5:1", critical: false },
  { id: "UX-V15", group: "UX-V", title: "Zoom 200% sem cortar o conteúdo", critical: false },
  { id: "UX-V16", group: "UX-V", title: "Menu móvel abre e Escape fecha", critical: false },
  { id: "UX-V17", group: "UX-V", title: "Sem botão de WhatsApp, e-mail externo ou Pix", critical: true },
  { id: "UX-V18", group: "UX-V", title: "404 ou 501 visível não conta como sucesso", critical: true },
];

export function checksByGroup(group) {
  return CHECKS.filter((check) => check.group === group);
}

export function checkById(id) {
  return CHECKS.find((check) => check.id === id);
}
