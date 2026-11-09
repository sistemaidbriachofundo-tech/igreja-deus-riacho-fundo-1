export const DEPENDENCY_REPORT = [
  {
    state: "BLOCKED",
    text: "Design System PR #102 não está integrado à main. Esta prévia usa estilos próprios e não altera os componentes do design system.",
  },
  {
    state: "BLOCKED",
    text: "RBAC PR #101 não está integrado à main. Os papéis de editor e publicador são simulados só nesta tela, sem guard de servidor.",
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
