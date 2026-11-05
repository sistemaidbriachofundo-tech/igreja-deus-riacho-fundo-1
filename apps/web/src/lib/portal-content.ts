export type MinistrySlug = "jovens" | "homens" | "adolescentes" | "mulheres" | "atmosfera";

export type PortalMinistry = {
  slug: MinistrySlug;
  name: string;
  eyebrow: string;
  headline: string;
  summary: string;
  purpose: string;
  image: string;
  imageAlt: string;
  tone: "gold" | "clay" | "olive" | "rose" | "night";
  pillars: { title: string; description: string }[];
  invitation: string;
};

export type PortalEvent = {
  id: string;
  day: string;
  month: string;
  date: string;
  time: string;
  title: string;
  category: string;
  ministry: MinistrySlug | "igreja";
  description: string;
  image: string;
};

// Conteudo DEMONSTRATIVO. Nenhuma data, evento ou descricao ministerial
// abaixo deve ser interpretada como programacao oficial da congregacao.
export const ministries: PortalMinistry[] = [
  {
    slug: "jovens",
    name: "Jovens",
    eyebrow: "FÉ QUE SE MOVE",
    headline: "Uma geração que não assiste. Vive.",
    summary: "Encontros, amizades e conversas que apontam para uma vida com propósito.",
    purpose: "Um espaço para crescer na fé, construir conexões verdadeiras e descobrir como viver o evangelho no dia a dia.",
    image: "/images/comunidade-oficial.jpg",
    imageAlt: "Comunidade reunida em um momento de comunhão",
    tone: "gold",
    pillars: [
      { title: "Pertencer", description: "Relações verdadeiras, acolhimento e lugar à mesa." },
      { title: "Crescer", description: "Conversas honestas, Palavra e discipulado." },
      { title: "Impactar", description: "Uma fé que transforma escolhas e alcança pessoas." },
    ],
    invitation: "Seu lugar nessa geração começa com uma conversa.",
  },
  {
    slug: "homens",
    name: "Homens",
    eyebrow: "CARÁTER EM CONSTRUÇÃO",
    headline: "A força de um homem está no que ele constrói.",
    summary: "Comunhão, responsabilidade e formação de homens comprometidos com Deus e com suas famílias.",
    purpose: "Caminhar juntos no amadurecimento espiritual, no cuidado com a família e no serviço que transforma a comunidade.",
    image: "/images/adoracao-oficial.jpg",
    imageAlt: "Momento de adoração na congregação",
    tone: "clay",
    pillars: [
      { title: "Caráter", description: "Integridade quando ninguém está olhando." },
      { title: "Família", description: "Presença, cuidado e responsabilidade." },
      { title: "Irmandade", description: "Homens que caminham e crescem juntos." },
    ],
    invitation: "Há lugar para você nessa caminhada.",
  },
  {
    slug: "adolescentes",
    name: "Adolescentes",
    eyebrow: "IDENTIDADE E PROPÓSITO",
    headline: "Você não precisa esperar crescer para fazer a diferença.",
    summary: "Um lugar para perguntas reais, amizades saudáveis e uma identidade firmada em Cristo.",
    purpose: "Acompanhar adolescentes em uma fase decisiva, aproximando fé, escolhas, relacionamentos e vida cotidiana.",
    image: "/images/hero-oficial.jpg",
    imageAlt: "Ambiente de encontro da Igreja de Deus",
    tone: "olive",
    pillars: [
      { title: "Identidade", description: "Descobrir quem somos para além das pressões." },
      { title: "Conexão", description: "Um ambiente seguro para conviver e conversar." },
      { title: "Coragem", description: "Escolhas que refletem fé e caráter." },
    ],
    invitation: "Há espaço para sua história, suas dúvidas e seus sonhos.",
  },
  {
    slug: "mulheres",
    name: "Mulheres",
    eyebrow: "GRAÇA QUE FLORESCE",
    headline: "Histórias diferentes. Uma fé que nos aproxima.",
    summary: "Comunhão, acolhimento e crescimento para mulheres em diferentes fases da vida.",
    purpose: "Cultivar um ambiente de cuidado, fortalecimento da fé, amizades e desenvolvimento de dons.",
    image: "/images/comunidade-oficial.jpg",
    imageAlt: "Pessoas em comunhão na Igreja de Deus",
    tone: "rose",
    pillars: [
      { title: "Acolhimento", description: "Cada história importa e merece ser ouvida." },
      { title: "Crescimento", description: "Aprendizado, Palavra e maturidade." },
      { title: "Comunhão", description: "Laços que fortalecem na vida cotidiana." },
    ],
    invitation: "Venha fazer parte de uma comunidade que caminha junta.",
  },
  {
    slug: "atmosfera",
    name: "Atmosfera",
    eyebrow: "VOLUNTARIADO DA IGREJA",
    headline: "O extraordinário também acontece nos bastidores.",
    summary: "Pessoas que colocam seus dons a serviço de outras pessoas.",
    purpose: "Conectar vocação, disponibilidade e serviço para tornar cada encontro mais acolhedor, organizado e significativo.",
    image: "/images/adoracao-oficial.jpg",
    imageAlt: "Ambiente de culto e serviço na igreja",
    tone: "night",
    pillars: [
      { title: "Servir", description: "Pequenos gestos de cuidado fazem a diferença." },
      { title: "Conectar", description: "Equipes unidas por um mesmo propósito." },
      { title: "Desenvolver", description: "Aprender, crescer e colocar dons em movimento." },
    ],
    invitation: "Seu dom pode encontrar um lugar para servir.",
  },
];

export const events: PortalEvent[] = [
  {
    id: "jovens-encontro",
    day: "14",
    month: "NOV",
    date: "2026-11-14",
    time: "19h30",
    title: "Noite de Conexão",
    category: "Jovens",
    ministry: "jovens",
    description: "Uma noite de comunhão, música e conversas que aproximam.",
    image: "/images/comunidade-oficial.jpg",
  },
  {
    id: "homens-mesa",
    day: "21",
    month: "NOV",
    date: "2026-11-21",
    time: "19h",
    title: "Homens à Mesa",
    category: "Homens",
    ministry: "homens",
    description: "Encontro de fé, convivência e reflexão sobre propósito.",
    image: "/images/adoracao-oficial.jpg",
  },
  {
    id: "adolescentes-identidade",
    day: "28",
    month: "NOV",
    date: "2026-11-28",
    time: "16h",
    title: "Entre Nós",
    category: "Adolescentes",
    ministry: "adolescentes",
    description: "Encontro para conversar sobre identidade e escolhas.",
    image: "/images/hero-oficial.jpg",
  },
  {
    id: "mulheres-comunhao",
    day: "05",
    month: "DEZ",
    date: "2026-12-05",
    time: "17h",
    title: "Florescer Juntas",
    category: "Mulheres",
    ministry: "mulheres",
    description: "Uma tarde de partilha, acolhimento e inspiração.",
    image: "/images/comunidade-oficial.jpg",
  },
  {
    id: "atmosfera-servir",
    day: "12",
    month: "DEZ",
    date: "2026-12-12",
    time: "15h",
    title: "Servir com Propósito",
    category: "Atmosfera",
    ministry: "atmosfera",
    description: "Encontro de integração para quem deseja servir.",
    image: "/images/adoracao-oficial.jpg",
  },
];

export function getMinistry(slug: string): PortalMinistry | undefined {
  return ministries.find((ministry) => ministry.slug === slug);
}

export const instagramUrl = "https://www.instagram.com/idbriacho_/";
