export const DEPENDENCY_REPORT = [
  {
    state: "ISOLATED",
    text: "Os tokens do design system já entram na interface pública. Esta prévia continua isolada, com estilos próprios, e não grava o site.",
  },
  {
    state: "BLOCKED",
    text: "Os papéis de editor e publicador desta tela são locais. A matriz do servidor não é consultada aqui e nenhum rascunho é gravado.",
  },
  {
    state: "BLOCKED",
    text: "A publicação simulada não ativa o site público, não grava seed e não chama a API.",
  },
  {
    state: "REUSO",
    text: "Navegação pública permanece Início, Quem somos, Agenda e Login. O leitor de sugestões do Riachinho já existente preserva o Alt das fotos não citadas.",
  },
  {
    state: "ABERTO",
    text: "PR #58 (mídia, papéis e Vivi) e PR #62 (bloqueio de IA simulada) seguem abertos e não foram editados. O envio ao Riachinho continua bloqueado enquanto o provedor for mock.",
  },
] as const;
