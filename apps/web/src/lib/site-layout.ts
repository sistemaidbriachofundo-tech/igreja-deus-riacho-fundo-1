/**
 * Contrato público da Home: apenas seções permitidas, cores pré-aprovadas
 * e imagens HTTPS ou da biblioteca da igreja. Nunca executa HTML/CSS de usuário.
 */
export const siteSections = [
  "essencia", "ministerios", "galeria", "atmosfera",
  "visita", "acontece", "videos", "convite",
] as const;
export type SiteSection = typeof siteSections[number];
export type SiteLayout = {
  version: 1;
  hero: { title: string; accent: string; description: string; imageUrl: string };
  gallery: {
    title: string; accent: string; description: string;
    items: { title: string; subtitle: string; alt: string; imageUrl: string }[];
  };
  appearance: "dourado" | "verde" | "marfim";
  sections: SiteSection[];
  hidden: SiteSection[];
};
export const defaultSiteLayout: SiteLayout = {
  version: 1,
  hero: {
    title: "Sua jornada com Deus", accent: "pode começar aqui.",
    description: "Um lugar de acolhimento, fé e propósito para você e sua família. Venha nos conhecer e caminhe com uma comunidade que cresce e serve junta.",
    imageUrl: "/images/fachada-igreja-riacho-fundo.avif",
  },
  gallery: {
    title: "A fé tem muitas formas", accent: "de se expressar.",
    description: "Louvor, juventude, oração e Palavra. Expressões que traduzem a vida em comunidade e o desejo de caminhar com Deus.",
    items: [
      { title: "Louvor", subtitle: "Uma expressão de fé", alt: "Homem cantando e com uma das mãos erguidas.", imageUrl: "/images/galeria-louvor.webp" },
      { title: "Juventude", subtitle: "Geração com propósito", alt: "Apresentação artística de jovens no palco.", imageUrl: "/images/galeria-juventude.webp" },
      { title: "Oração", subtitle: "Caminhar uns com os outros", alt: "Pessoas reunidas em oração.", imageUrl: "/images/galeria-oracao.webp" },
      { title: "Palavra", subtitle: "Uma mensagem que inspira", alt: "Homem falando com um microfone.", imageUrl: "/images/galeria-palavra.webp" },
    ],
  },
  appearance: "dourado",
  sections: [...siteSections],
  hidden: [],
};
export const sectionNames: Record<SiteSection,string> = {
  essencia:"Nossa essência",ministerios:"Ministérios",galeria:"Galeria de fotos",
  atmosfera:"Atmosfera",visita:"Primeira visita",acontece:"Notícias e agenda",
  videos:"Vídeos e YouTube",convite:"Convite final",
};
const isText = (x:unknown,limit:number):x is string =>
  typeof x==="string" && x.trim().length>0 && x.length<=limit;
const localMedia=/^\/cms\/site-media\/files\/[A-Za-z0-9_-]{1,80}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9-]{1,45}\.(?:jpg|png|webp|avif)$/i;
const blobMedia=/^\/church\/[A-Za-z0-9_-]+\/site\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp|avif)$/i;
export function validSiteImage(x:unknown):x is string {
  if(!isText(x,1600))return false;
  if(/^\/images\/[\w/-]+\.(jpg|jpeg|png|webp|avif)$/i.test(x)||localMedia.test(x))return true;
  try{
    const u=new URL(x);
    return u.protocol==="https:" && !u.username && !u.password && !u.hash
      && u.hostname.endsWith(".public.blob.vercel-storage.com") && blobMedia.test(u.pathname);
  }catch{return false;}
}
export function parseSiteLayout(value:unknown):SiteLayout|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const o=value as Partial<SiteLayout>, hero=o.hero, gallery=o.gallery;
  if(o.version!==1||!hero||!gallery)return null;
  if(!isText(hero.title,110)||!isText(hero.accent,110)||!isText(hero.description,500)||!validSiteImage(hero.imageUrl))return null;
  if(!isText(gallery.title,110)||!isText(gallery.accent,110)||!isText(gallery.description,500))return null;
  if(!Array.isArray(gallery.items)||gallery.items.length!==4||gallery.items.some(x=>!x||!isText(x.title,55)||!isText(x.subtitle,80)||!isText(x.alt,220)||!validSiteImage(x.imageUrl)))return null;
  if(o.appearance!=="dourado"&&o.appearance!=="verde"&&o.appearance!=="marfim")return null;
  if(!Array.isArray(o.sections)||o.sections.length!==siteSections.length||new Set(o.sections).size!==siteSections.length||o.sections.some(x=>!siteSections.includes(x)))return null;
  if(!Array.isArray(o.hidden)||new Set(o.hidden).size!==o.hidden.length||o.hidden.some(x=>!siteSections.includes(x))||o.hidden.includes("convite"))return null;
  return o as SiteLayout;
}
export function parsePublicSiteLayout(value:unknown):{layout:SiteLayout|null}|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const response=value as {layout?:unknown};
  return {layout:response.layout===null?null:parseSiteLayout(response.layout)};
}
export const siteMediaLibrary = [
  { title:"Fachada da Igreja de Deus — capa pública",src:"/images/fachada-igreja-riacho-fundo.avif" },
  { title:"Adoração — foto oficial",src:"/images/adoracao-oficial.jpg" },
  { title:"Culto — foto oficial",src:"/images/hero-oficial.jpg" },
  { title:"Louvor",src:"/images/galeria-louvor.webp" },
  { title:"Juventude",src:"/images/galeria-juventude.webp" },
  { title:"Oração",src:"/images/galeria-oracao.webp" },
  { title:"Palavra",src:"/images/galeria-palavra.webp" },
] as const;
