/**
 * Recusa no navegador, antes de qualquer rede, pedidos com dado pessoal,
 * contato ou tentativa de mudar as regras. O servidor continua sendo o limite real.
 * Usado pelo assistente editorial interno. O portal público não conversa com IA.
 */
const PUBLIC_SCOPE = [
  /\b(cpf|rg\b|passaporte)\b/i,
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
  /\b(prontu[aá]rio|caso pastoral|aconselhamento pastoral|disciplina eclesi[aá]stica)\b/i,
  /\b(lista de membros|dados do membro|telefone do membro|e-?mail do membro|endere[cç]o do membro)\b/i,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /(?:\+?\d{2}\s?)?\(?\d{2}\)?\s?9\d{4}-?\d{4}/,
  /\b(ignore (as |todas as )?(instru[cç][oõ]es|regras)|system prompt|jailbreak|modo desenvolvedor)\b/i,
];

const EDITORIAL_SCOPE = PUBLIC_SCOPE.filter((_, index) => index !== 4 && index !== 5);

/** Respostas editoriais podem trazer marcadores; o texto exibido fica sem ênfase markdown. */
export function formatPublicReply(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
}

export function assistantScopeRefusal(text: string, audience: "public" | "editorial" = "public"): string | null {
  const value = text.trim();
  if (!value) return null;
  const patterns = audience === "public" ? PUBLIC_SCOPE : EDITORIAL_SCOPE;
  if (!patterns.some((pattern) => pattern.test(value))) return null;
  return audience === "public"
    ? "Não enviei esta mensagem. O assistente não lê dados de membros, contatos, documentos ou assuntos pastorais. Apague esses dados e pergunte só sobre a igreja no portal."
    : "Não enviei este pedido. O assistente editorial não lê dados de membros, documentos ou assuntos pastorais. Retire esses dados do texto.";
}
