import { getApiBaseUrl } from "./api";
import { withBasePath } from "./paths";
import { SITE_COVER_PHOTO, SITE_IDENTITY_PHOTO, SITE_GALLERY_PHOTOS, usesPreviousGallery } from "@idbrf/shared";

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
  identity?: { imageUrl: string; alt: string };
  gallery: {
    title: string; accent: string; description: string;
    items: { title: string; subtitle: string; alt: string; imageUrl: string }[];
  };
  appearance: "dourado" | "verde" | "marfim";
  sections: SiteSection[];
  hidden: SiteSection[];
};
export const PUBLIC_FACADE_IMAGE = "/images/fachada-igreja-riacho-fundo.jpg";

export const defaultSiteLayout: SiteLayout = {
  version: 1,
  hero: {
    title: "Igreja de Deus", accent: "Riacho Fundo I",
    description: "Cultos aos domingos, às 10h e às 19h. Venha participar com a gente.",
    imageUrl: PUBLIC_FACADE_IMAGE,
  },
  identity: SITE_IDENTITY_PHOTO,
  gallery: {
    title: "A igreja", accent: "em fotos",
    description: "Registros dos nossos cultos, encontros e momentos de oração.",
    items: SITE_GALLERY_PHOTOS,
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
  if(!Array.isArray(gallery.items)||(gallery.items.length<1||gallery.items.length>8)||gallery.items.some(x=>!x||!isText(x.title,55)||!isText(x.subtitle,80)||!isText(x.alt,220)||!validSiteImage(x.imageUrl)))return null;
  if(o.appearance!=="dourado"&&o.appearance!=="verde"&&o.appearance!=="marfim")return null;
  if(!Array.isArray(o.sections)||o.sections.length!==siteSections.length||new Set(o.sections).size!==siteSections.length||o.sections.some(x=>!siteSections.includes(x)))return null;
  if(!Array.isArray(o.hidden)||new Set(o.hidden).size!==o.hidden.length||o.hidden.some(x=>!siteSections.includes(x))||o.hidden.includes("convite"))return null;
  if(o.identity!==undefined&&(!o.identity||!isText(o.identity.alt,220)||!validSiteImage(o.identity.imageUrl)))return null;
  return {
    ...o as SiteLayout,
    hero: { ...hero, imageUrl: ["/images/adoracao-oficial.jpg", SITE_COVER_PHOTO].includes(hero.imageUrl) ? PUBLIC_FACADE_IMAGE : hero.imageUrl },
    identity: o.identity ?? SITE_IDENTITY_PHOTO,
    gallery: { ...gallery, items: usesPreviousGallery(gallery.items) ? SITE_GALLERY_PHOTOS : gallery.items },
  };
}
export function parsePublicSiteLayout(value:unknown):{layout:SiteLayout|null}|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const response=value as {layout?:unknown};
  return {layout:response.layout===null?null:parseSiteLayout(response.layout)};
}
export const siteMediaLibrary = [
  { title: "Fachada oficial do Riacho Fundo I", src: PUBLIC_FACADE_IMAGE },
  { title: "Quem somos", src: SITE_IDENTITY_PHOTO.imageUrl },
  ...SITE_GALLERY_PHOTOS.map(photo => ({ title: photo.title, src: photo.imageUrl })),
];

export function resolveSitePhoto(url: string): string {
  if (url.startsWith("/cms/site-media/files/")) {
    try { return getApiBaseUrl() + url; } catch { return withBasePath(SITE_COVER_PHOTO); }
  }
  return url.startsWith("/images/") ? withBasePath(url) : url;
}
