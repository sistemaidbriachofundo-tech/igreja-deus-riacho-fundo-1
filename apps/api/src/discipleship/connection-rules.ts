export const CONNECTION_STAGES = [
  { code: "recepcao", title: "Recepção e Primeiro Contato", description: "Recepção pela Atmosfera, participação no culto, Sala de Comunhão, cadastro, oração e presente ao visitante." },
  { code: "primeiro-cuidado", title: "Primeiro Cuidado", description: "A Equipe Conexão faz o primeiro contato em 24 a 36 horas, com boas-vindas, oração e convite. Acompanhamento de 30 dias." },
  { code: "primeiros-passos", title: "Curso Primeiros Passos", description: "Quatro aulas sobre salvação, vida devocional, vida na igreja e significado do batismo." },
  { code: "classe-batismo", title: "Classe de Batismo", description: "De duas a quatro aulas sobre batismo, compromisso público, ceia e orientações práticas, com entrevista pastoral." },
  { code: "batismo", title: "Batismo nas Águas", description: "Celebração pública com confirmação, certificado e encaminhamento à Classe de Integração." },
  { code: "classe-integracao", title: "Classe de Integração IDB Riacho", description: "Quatro aulas sobre história, visão, missão, valores A.C.O.L.H.E.R., cultura, cuidado pastoral e responsabilidades." },
  { code: "recebimento", title: "Recebimento Oficial de Membros", description: "Validação pastoral por batismo, transferência, reconciliação ou aclamação, seguida de apresentação pública e registro." },
  { code: "conexao-geracional", title: "Conexão com Ministérios Geracionais", description: "Encaminhamento do novo membro ao grupo que corresponde à sua geração." },
  { code: "dna-servico", title: "DNA e Serviço", description: "Quatro aulas sobre pertencer, crescer e servir, ajudando a identificar onde e por que servir na igreja." },
] as const;

export const CONNECTION_TRACK_CODE = "conexao";
export const CONNECTION_TRACK_NAME = "Trilha da Conexão";

export function isConnectionTrackName(name: string | undefined) {
  return /^(?:trilha\s+(?:da\s+)?)?conex[aã]o$/i.test((name ?? "").trim());
}

export function isConnectionTrack(track: { code?: string | null; name: string }) {
  return track.code === CONNECTION_TRACK_CODE || (track.code === undefined && isConnectionTrackName(track.name));
}

export function baptismWaived(code: string | null | undefined, modality: string | null | undefined) {
  return (modality === "TRANSFERENCIA" || modality === "RECONCILIACAO" || modality === "ACLAMACAO")
    && (code === "classe-batismo" || code === "batismo");
}
