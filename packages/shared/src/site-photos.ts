const path = (name: string) => "/images/riacho/" + name + ".webp";

export const SITE_COVER_PHOTO = path("fachada");
export const SITE_IDENTITY_PHOTO = {
  imageUrl: path("comunidade"),
  alt: "Pessoas reunidas em oração durante um culto.",
};

export const SITE_GALLERY_PHOTOS = [
  { title: "Palavra", subtitle: "Mensagem durante o culto", alt: "Pregador com microfone e uma das mãos erguidas.", imageUrl: path("palavra") },
  { title: "Adoração", subtitle: "Um momento de oração", alt: "Mulher com as mãos juntas em oração.", imageUrl: path("adoracao") },
  { title: "Música", subtitle: "Equipe de louvor", alt: "Músico tocando guitarra elétrica.", imageUrl: path("guitarra") },
  { title: "Intercessão", subtitle: "Cuidado em comunidade", alt: "Grupo reunido em oração.", imageUrl: path("intercessao") },
  { title: "Nosso templo", subtitle: "Culto no Riacho Fundo I", alt: "Vista do palco e da congregação no templo.", imageUrl: path("templo") },
  { title: "Expressão", subtitle: "Adoração por meio da dança", alt: "Mulher com os braços abertos durante uma apresentação.", imageUrl: path("expressao") },
  { title: "Louvor", subtitle: "Música durante o culto", alt: "Cantora com microfone acompanhada por músicos.", imageUrl: path("louvor") },
  { title: "Santa Ceia", subtitle: "Uma celebração em comunidade", alt: "Bandejas com os elementos da Santa Ceia.", imageUrl: path("ceia") },
];

export function usesPreviousGallery(items: readonly { imageUrl: string }[]): boolean {
  return items.length === 4 && items.every(({ imageUrl }, index) =>
    imageUrl === ["/images/galeria-louvor.webp", "/images/galeria-juventude.webp", "/images/galeria-oracao.webp", "/images/galeria-palavra.webp"][index],
  );
}
