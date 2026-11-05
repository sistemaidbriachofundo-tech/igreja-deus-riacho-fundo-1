import Link from "next/link";
import type { Metadata } from "next";
import { instagramUrl } from "../../lib/portal-content";
import { withBasePath } from "../../lib/paths";
import { PublicPage, Eyebrow, ContactCTA, portalStyles as s } from "../../components/PublicPortal";

export const metadata: Metadata = {
  title: "Contato e Primeira Visita",
  description: "Conecte-se com a Igreja de Deus no Riacho Fundo I e saiba como acompanhar os canais oficiais.",
};

export default function ContactPage() {
  return <PublicPage>
    <main id="conteudo">
      <section className={s.subhero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/comunidade-oficial.jpg")} alt="" className={s.subheroImage} />
        <span className={s.subheroOverlay} />
        <div className={s.subheroContent}>
          <div className={s.breadcrumbs}><Link href="/">Início</Link><span>/</span>Contato</div>
          <Eyebrow light>VOCÊ É BEM-VINDO</Eyebrow>
          <h1 className={s.subheroTitle}>Toda boa conversa começa com um olá.</h1>
          <p className={s.subheroLead}>Sua primeira visita não precisa ser complicada. Quer conhecer a igreja ou conversar com alguém? Aqui está por onde começar.</p>
        </div>
      </section>
      <section className={s.mainSection}>
        <div className={s.sectionHeading}><div><Eyebrow>VAMOS NOS CONECTAR</Eyebrow><h2>Escolha por onde começar.</h2><p>Um convite para descobrir a comunidade, com calma e sem compromisso.</p></div></div>
        <div className={s.contactGrid}>
          <article className={s.contactCard}><span>01 / REDES SOCIAIS</span><h2>Acompanhe a igreja.</h2><p>Siga o perfil oficial para consultar comunicados, programação atualizada e informações de contato.</p><a href={instagramUrl} target="_blank" rel="noopener noreferrer">Abrir Instagram oficial ↗</a></article>
          <article className={s.contactCard}><span>02 / VIDA EM COMUNIDADE</span><h2>Encontre um ministério.</h2><p>Jovens, homens, adolescentes, mulheres e voluntariado. Explore as áreas do portal e descubra onde se conectar.</p><Link href="/ministerios/">Conhecer os ministérios ↗</Link></article>
        </div>
        <p className={s.contactNote}>Endereço completo, horários de culto, contatos telefônicos e formulários serão publicados aqui após validação institucional. Nenhuma informação de visita está sendo coletada nesta versão demonstrativa.</p>
      </section>
      <ContactCTA title="Estamos construindo um lugar para receber você." text="Enquanto as informações definitivas são validadas, acompanhe os canais oficiais e conheça os ministérios." />
    </main>
  </PublicPage>;
}
