/**
 * Imagens de demonstração, liberadas para uso editorial sob a Licença Unsplash.
 * Não representam a congregação e devem ser substituídas por fotos autorizadas.
 *
 * Referências:
 * /photo-1730875648201-c309ae1c2543 Alex Gallegos
 * /photo-1569292567777-e5d61a759322 Unsplash community collection
 * /photo-1779903597416-47d005a931ef Ashikul Islam Anik
 * /photo-1607748862156-7c548e7e98f4 Joel Muniz
 * /photo-1758599669406-d5179ccefcb9 Vitaly Gariev
 * /photo-1758272133786-ee98adcc6837 Vitaly Gariev
 */
const unsplash = (id: string, width = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=83`;

export const portalVisuals = {
  hero: unsplash("photo-1730875648201-c309ae1c2543", 2200),
  encounter: unsplash("photo-1569292567777-e5d61a759322", 1400),
  joven: unsplash("photo-1569292567777-e5d61a759322", 1400),
  homens: unsplash("photo-1779903597416-47d005a931ef", 1400),
  adolescentes: unsplash("photo-1758272133786-ee98adcc6837", 1400),
  mulheres: unsplash("photo-1607748862156-7c548e7e98f4", 1400),
  atmosfera: unsplash("photo-1758599669406-d5179ccefcb9", 1400),
} as const;
export const ministryPhoto = (slug: string) => ({
  jovens: portalVisuals.joven,
  homens: portalVisuals.homens,
  adolescentes: portalVisuals.adolescentes,
  mulheres: portalVisuals.mulheres,
  atmosfera: portalVisuals.atmosfera,
}[slug as "jovens"|"homens"|"adolescentes"|"mulheres"|"atmosfera"] ?? portalVisuals.encounter);
