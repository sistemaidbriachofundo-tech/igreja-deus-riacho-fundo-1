"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ministries, instagramUrl, type MinistrySlug } from "../lib/portal-content";
import s from "./visit-planner.module.css";

type Group = "so" | "familia" | "amigos" | "criancas";
type Interest = "conhecer" | MinistrySlug;
const groups: { id: Group; title: string; description: string }[] = [
  { id: "so", title: "Vou sozinho(a)", description: "Quero chegar e conhecer a comunidade." },
  { id: "familia", title: "Com minha família", description: "Vamos conhecer a igreja juntos." },
  { id: "amigos", title: "Com amigos", description: "Queremos conhecer a comunidade." },
  { id: "criancas", title: "Com crianças", description: "Preciso entender como será nossa chegada." },
];
const interests: { id: Interest; title: string; description: string }[] = [
  { id: "conhecer", title: "Conhecer a igreja", description: "Acolhimento, comunhão e primeira visita" },
  ...ministries.map((ministry) => ({ id: ministry.slug, title: ministry.name, description: ministry.summary })),
];

export function VisitPlanner() {
  const [step, setStep] = useState(0);
  const [group, setGroup] = useState<Group | null>(null);
  const [interest, setInterest] = useState<Interest>("conhecer");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) { initialized.current = true; return; }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("ministerio");
    if (slug && ministries.some((ministry) => ministry.slug === slug)) setInterest(slug as MinistrySlug);
  }, []);

  const interestName = interests.find((value) => value.id === interest)?.title ?? "Conhecer a igreja";
  const message = useMemo(() => {
    const visitGroup = group === "so" ? "Vou sozinho(a)" : group === "familia" ? "Vou com minha família" : group === "amigos" ? "Vou com amigos" : "Vou com crianças";
    const subject = interest === "conhecer" ? "conhecer a igreja" : "conhecer o ministério de " + interestName;
    return "Olá! Gostaria de " + subject + " na Igreja de Deus — Riacho Fundo I. " + visitGroup + ". Poderiam confirmar a programação atualizada, o endereço e como funciona a primeira visita? Obrigado(a)!";
  }, [group, interest, interestName]);

  async function copyMessage() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <section className={s.planner} aria-labelledby="planner-title">
      <div className={s.topline}><span>UMA EXPERIÊNCIA PARA QUEM ESTÁ CHEGANDO</span><span>SEM CADASTRO • SEM COMPROMISSO</span></div>
      <div className={s.progress} role="progressbar" aria-label="Progresso da primeira visita" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1}>
        <span style={{ width: String(((step + 1) / 3) * 100) + "%" }} />
      </div>
      <div className={s.area}>
        <div className={s.intro}>
          <span className={s.counter}>0{step + 1} <small>/ 03</small></span>
          <h2 id="planner-title" tabIndex={-1} ref={headingRef}>
            {step === 0 ? <>Como você pretende <em>nos visitar?</em></> : step === 1 ? <>O que você gostaria <em>de conhecer?</em></> : <>Sua visita começa <em>com um olá.</em></>}
          </h2>
          <p>{step === 0 ? "Sem coletar seus dados, vamos organizar os próximos passos de sua primeira visita." : step === 1 ? "Escolha uma área para conhecer. Você pode mudar de ideia a qualquer momento." : "Preparamos uma mensagem para facilitar seu contato. Não existe reserva ou inscrição automática."}</p>
        </div>
        {step === 0 && <div className={s.choices} role="group" aria-label="Com quem você irá visitar">
          {groups.map((item, i) => (
            <button key={item.id} type="button" className={group === item.id ? s.selected : s.choice}
              aria-pressed={group === item.id} onClick={() => { setGroup(item.id); setCopied(false); }}>
              <span className={s.choiceNumber}>0{i + 1}</span><span className={s.choiceCopy}><strong>{item.title}</strong><small>{item.description}</small></span>
              <span aria-hidden="true" className={s.choiceIcon}>{group === item.id ? "✓" : "↗"}</span>
            </button>
          ))}
        </div>}
        {step === 1 && <div className={s.interests} role="group" aria-label="Qual área da igreja você quer conhecer">
          {interests.map((item) => (
            <button key={item.id} type="button" className={interest === item.id ? s.interestSelected : s.interest}
              aria-pressed={interest === item.id} onClick={() => { setInterest(item.id); setCopied(false); }}>
              <span className={s.dot} aria-hidden="true" /><strong>{item.title}</strong><small>{item.description}</small>
            </button>
          ))}
        </div>}
        {step === 2 && <div className={s.result}>
          <div className={s.summary}>
            <div><span>COM QUEM</span><strong>{groups.find((item) => item.id === group)?.title}</strong></div>
            <div><span>INTERESSE</span><strong>{interestName}</strong></div>
          </div>
          <div className={s.message}>
            <span>MENSAGEM SUGERIDA PARA ENVIAR</span><p>{message}</p>
            <button type="button" className={s.copy} onClick={copyMessage}>{copied ? "✓ Mensagem copiada" : "⧉ Copiar mensagem"}</button>
            {copied && <p className={s.notice} role="status">Agora você pode colar a mensagem ao falar com a igreja.</p>}
            {copyError && <p className={s.notice} role="status">Selecione e copie o texto manualmente, pois a cópia automática não está disponível.</p>}
          </div>
          <div className={s.actions}>
            <a className={s.primary} href={instagramUrl} target="_blank" rel="noopener noreferrer">Abrir Instagram oficial <span aria-hidden="true">↗</span></a>
            <Link className={s.secondary} href="/ministerios/">Explorar os ministérios <span aria-hidden="true">→</span></Link>
          </div>
          <p className={s.notice}>Envie a mensagem pelo canal disponível no perfil oficial. O portal não transmite seus dados, não agenda cultos e não confirma vagas.</p>
        </div>}
        <div className={s.footer}>
          {step > 0 ? <button type="button" className={s.back} onClick={() => { setStep((n) => n - 1); setCopied(false); }}>← Voltar</button> : <span className={s.privacy}>Nenhuma informação é armazenada.</span>}
          {step < 2 ? <button type="button" disabled={step === 0 && group === null} className={s.next} onClick={() => setStep((n) => n + 1)}>Continuar <span aria-hidden="true">↗</span></button> : <button type="button" className={s.back} onClick={() => { setStep(0); setGroup(null); setInterest("conhecer"); setCopied(false); }}>Recomeçar ↺</button>}
        </div>
      </div>
    </section>
  );
}
