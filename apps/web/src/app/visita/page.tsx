import Link from "next/link";
import type { Metadata } from "next";
import { withBasePath } from "../../lib/paths";
import { PublicPage } from "../../components/PublicPortal";
import { VisitPlanner } from "../../components/VisitPlanner";
import s from "./visita.module.css";

export const metadata: Metadata = {
  title: "Planeje sua Primeira Visita",
  description: "Prepare sua primeira visita à Igreja de Deus no Riacho Fundo I, sem cadastro e sem compromisso.",
};

export default function VisitPage() {
  return (
    <PublicPage>
      <main id="conteudo">
        <section className={s.hero} aria-labelledby="visit-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBasePath("/images/adoracao-oficial.jpg")} className={s.image} alt="" fetchPriority="high" />
          <div className={s.shade} />
          <div className={s.inner}>
            <div className={s.breadcrumb}><Link href="/">INÍCIO</Link><span>/</span> PRIMEIRA VISITA</div>
            <span className={s.eyebrow}>UM CONVITE PARA FAZER PARTE</span>
            <h1 id="visit-title">Tem um lugar<br /><em>para você aqui.</em></h1>
            <p>Preparamos um caminho simples para sua primeira visita. Sem formulários, sem agendamento fictício e no seu próprio ritmo.</p>
            <a href="#planejar" className={s.down}>COMEÇAR MINHA JORNADA <span aria-hidden="true">↓</span></a>
          </div>
        </section>
        <div className={s.body} id="planejar">
          <VisitPlanner />
        </div>
        <section className={s.after} aria-labelledby="before-you-visit">
          <span>ANTES DE SAIR DE CASA</span>
          <h2 id="before-you-visit">A visita começa com <em>informação confiável.</em></h2>
          <p>Confirme horários, endereço e programação pelos canais oficiais antes de ir. Quando a igreja validar esses dados para publicação, eles também aparecerão diretamente no portal.</p>
          <Link href="/contato/">Ver formas de contato <span aria-hidden="true">↗</span></Link>
        </section>
      </main>
    </PublicPage>
  );
}
