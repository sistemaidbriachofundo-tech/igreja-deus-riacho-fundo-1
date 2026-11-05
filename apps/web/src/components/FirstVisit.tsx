import Link from "next/link";
import { withBasePath } from "../lib/paths";
import { instagramUrl } from "../lib/portal-content";
import s from "./first-visit.module.css";

/**
 * A visita deve ser possível sem cadastros fictícios ou dados de culto não validados.
 * Toda orientação factual de horário/endereço aponta aos canais oficiais.
 */
export function FirstVisitFeature() {
  return (
    <section id="primeira-visita" className={s.feature} aria-labelledby="first-visit-title">
      <div className={s.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/adoracao-oficial.jpg")} alt="Registro de um momento de adoração da congregação" loading="lazy" />
        <span className={s.photoTag}>NOSSA COMUNIDADE <i aria-hidden="true" /> UM LUGAR PARA VOCÊ</span>
        <span className={s.photoRing} aria-hidden="true" />
      </div>
      <div className={s.content}>
        <span className={s.sectionIndex}>04 / SUA PRIMEIRA VISITA</span>
        <h2 id="first-visit-title">O primeiro passo<br />é <em>se aproximar.</em></h2>
        <p className={s.lead}>Talvez você ainda não conheça ninguém por aqui. Tudo bem. Queremos que encontrar a igreja seja simples, do primeiro contato à sua visita.</p>
        <ol className={s.steps}>
          <li><span>01</span><div><strong>Descubra nossa comunidade.</strong><p>Conheça a igreja, nossas convicções e os ministérios.</p></div></li>
          <li><span>02</span><div><strong>Confira a programação.</strong><p>Consulte os comunicados oficiais antes de sair de casa.</p></div></li>
          <li><span>03</span><div><strong>Venha nos conhecer.</strong><p>Entre em contato para confirmar os detalhes da sua visita.</p></div></li>
        </ol>
        <div className={s.actions}>
          <Link href="/visita/" className={s.primary}>Planejar minha primeira visita <span aria-hidden="true">↗</span></Link>
          <a href={instagramUrl} rel="noopener noreferrer" target="_blank" className={s.secondary}>Ver canais oficiais <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>
  );
}

const questions = [
  {
    question: "Como posso saber o dia e o horário dos cultos?",
    answer: "A programação deve ser confirmada pelos canais oficiais da igreja. No Instagram você encontra os comunicados mais recentes e pode solicitar orientação antes da visita.",
  },
  {
    question: "Posso conhecer os ministérios antes de visitar?",
    answer: "Sim. O portal apresenta os espaços de Jovens, Homens, Adolescentes, Mulheres e Atmosfera, nosso voluntariado. A participação e a programação específica devem ser confirmadas com a igreja.",
  },
  {
    question: "E se eu não conhecer ninguém?",
    answer: "Você pode começar entrando em contato pelos canais oficiais. Não precisa ter todas as respostas ou saber exatamente por onde começar para dar o primeiro passo.",
  },
  {
    question: "Como confirmo o endereço e outras orientações?",
    answer: "Entre em contato pelo perfil oficial para confirmar endereço, horários e orientações atualizadas. Estamos evitando divulgar informações não verificadas nesta etapa do portal.",
  },
] as const;

export function VisitQuestions() {
  return (
    <section className={s.questions} aria-labelledby="visit-questions-title">
      <div className={s.questionsIntro}>
        <span className={s.sectionIndex}>PERGUNTAS DE QUEM ESTÁ CHEGANDO</span>
        <h2 id="visit-questions-title">Antes de chegar,<br /><em>pode perguntar.</em></h2>
        <p>Não queremos que uma dúvida seja uma barreira entre você e a comunidade.</p>
        <a href={instagramUrl} rel="noopener noreferrer" target="_blank" className={s.textLink}>Falar pelo Instagram oficial <span aria-hidden="true">↗</span></a>
      </div>
      <div className={s.questionList}>
        {questions.map((question, index) => (
          <details className={s.question} key={question.question}>
            <summary>
              <span className={s.questionNumber}>0{index + 1}</span>
              <strong>{question.question}</strong>
              <span className={s.plus} aria-hidden="true">+</span>
            </summary>
            <p>{question.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
