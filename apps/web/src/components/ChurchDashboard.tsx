"use client";

import { useMemo } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { withBasePath } from "../lib/paths";
import { summarize, type Member } from "../lib/church-synthetic";
import { useChurchRecords } from "../lib/use-church-records";
import s from "./church-dashboard.module.css";

function InitialAvatar({ person, tiny = false }: { person: Member; tiny?: boolean }) {
  const nameParts = person.name.trim().split(/\s+/);
  const initials = [nameParts[0]?.[0], nameParts.at(-1)?.[0]].filter(Boolean).join("").toUpperCase();
  return <span className={tiny ? s.avatarSmall : s.avatar} role="img" aria-label={"Avatar ilustrativo de " + person.name}>{initials}</span>;
}
function Metric({ tag, label, value, hint, icon, accent = false }: { tag: string; label: string; value: number; hint: string; icon: "people" | "family" | "layers" | "badge"; accent?: boolean }) {
  return <article className={accent ? s.metricAccent : s.metric}>
    <div className={s.metricTop}><span className={s.metricTag}>{tag}</span><span className={s.metricIcon}><UIIcon name={icon} size={19}/></span></div>
    <div className={s.metricBottom}><div><span className={s.metricValue}>{String(value).padStart(2,"0")}</span><strong>{label}</strong><small>{hint}</small></div><span className={s.metricArrow}><UIIcon name="arrow" size={16}/></span></div>
  </article>;
}

export function ChurchDashboard() {
  const { members } = useChurchRecords();
  const stats = useMemo(() => summarize(members), [members]);
  const pending = members.filter(p => p.status === "PENDING_ADMISSION");
  const cardQueue = members.filter(p => p.status === "ACTIVE" && p.card !== "ACTIVE");
  const statusData = [
    { label:"Membros ativos", count:stats.active, color:"#c69c51" },
    { label:"Em admissão", count:stats.pending, color:"#776457" },
    { label:"Visitantes", count:stats.visitors, color:"#c3b5a1" },
    { label:"Inativos", count:members.filter(p => p.status==="INACTIVE").length, color:"#e3dacd" },
  ];
  const years = Array.from(new Set(members.map(p => p.joinedAt.slice(0,4)))).sort().slice(-5);
  const yearly = years.map(year => ({ year, count:members.filter(p => p.joinedAt.startsWith(year)).length }));
  const maxYearly = Math.max(1,...yearly.map(x => x.count));
  const diagram = statusData.map((entry,i) => {
    const previous = statusData.slice(0,i).reduce((sum,p)=>sum+p.count,0);
    const start = Math.round(previous / Math.max(stats.total,1) * 1000)/10;
    const end = Math.round((previous+entry.count) / Math.max(stats.total,1) *1000)/10;
    return `${entry.color} ${start}% ${end}%`;
  }).join(", ");
  const nextItems = [
    ...pending.filter(p => p.stage === "PASTOR").map(person => ({ person, label:"Aprovação pastoral",type:"Aguardando decisão" })),
    ...pending.filter(p => p.stage !== "PASTOR").map(person => ({ person, label:person.stage==="DOCUMENTS"?"Documentação":"Conferência da Secretaria",type:"Processo aberto" })),
  ].slice(0,4);

  return <AppShell active="visao" meta="Visão geral">
    <div className={s.dashboard}>
      <div className={s.pageTop}>
        <div><p className={s.eyebrow}><span className={s.eyebrowLine}/> VISÃO INSTITUCIONAL / RIACHO FUNDO I</p>
          <h1>Um lugar para <em>cuidar.</em></h1>
          <p className={s.lead}>O que importa na sua igreja, com clareza em cada detalhe.</p>
        </div>
        <a className={s.buttonLight} href={withBasePath("/app/membros/")}><UIIcon name="people" size={17}/> Diretório de pessoas <UIIcon name="arrow" size={16}/></a>
      </div>

      <section className={s.hero}>
        <div className={s.heroOrnament} aria-hidden="true"><span/><span/><span/></div>
        <div className={s.heroContent}>
          <div className={s.heroOverline}><UIIcon name="spark" size={15}/> PLATAFORMA IGREJA DE DEUS <span className={s.heroDivider}/> EDIÇÃO 2026</div>
          <h2>Mais presença.<br/><span>Mais propósito.</span></h2>
          <p>A tecnologia a serviço de pessoas, famílias e da missão da igreja.</p>
          <a href={withBasePath("/app/secretaria/")} className={s.heroAction}>Ver processos em andamento <UIIcon name="arrow" size={18}/></a>
        </div>
        <div className={s.heroVisual} aria-label={stats.active + " membros ativos e " + stats.pending + " admissões em andamento"}>
          <div className={s.orbitOuter}><span className={s.orbitSatA}/><span className={s.orbitSatB}/></div>
          <div className={s.orbitMid}/>
          <div className={s.orbitCore}>
            <UIIcon name="spark" size={22}/>
            <strong>{String(stats.active).padStart(2,"0")}</strong>
            <span>MEMBROS ATIVOS</span>
          </div>
          <div className={s.orbitCaption}><span className={s.orbitCaptionDot}/> VISÃO DE COMUNIDADE <UIIcon name="activity" size={14}/></div>
        </div>
        <div className={s.heroCounter}><span className={s.heroCounterIcon}><UIIcon name="activity" size={17}/></span><span><strong>{String(stats.pending).padStart(2,"0")}</strong><small>admissões exigem<br/>acompanhamento</small></span></div>
      </section>

      <section aria-label="Indicadores da base sintética" className={s.metrics}>
        <Metric tag="01 / PESSOAS" icon="people" label="Pessoas cadastradas" value={stats.total} hint="Registros sintéticos" />
        <Metric tag="02 / MEMBRESIA" icon="family" label="Membros ativos" value={stats.active} hint="Admissões concluídas" />
        <Metric tag="03 / JORNADAS" icon="layers" label="Em admissão" value={stats.pending} hint="Acompanhamento necessário" accent/>
        <Metric tag="04 / IDENTIDADE" icon="badge" label="Carteirinhas ativas" value={stats.issued} hint="Credenciais sintéticas" />
      </section>

      <div className={s.split}>
        <div className={s.leftColumn}>
          <section className={s.insights} aria-labelledby="insights-heading">
            <div className={s.blockHeader}>
              <div><span className={s.blockKicker}>INTELIGÊNCIA DE GESTÃO</span><h2 id="insights-heading">O panorama da congregação</h2><p>Composição atual da base de avaliação, sem números estimados.</p></div>
              <span className={s.dataLabel}><UIIcon name="activity" size={14}/> Tempo real nesta sessão</span>
            </div>
            <div className={s.insightsBody}>
              <div className={s.donut} style={{background:`conic-gradient(${diagram})`}} role="img" aria-label={`Distribuição: ${statusData.map(d=>d.label+": "+d.count).join(", ")}`}>
                <div><span>TOTAL DE PESSOAS</span><strong>{stats.total}</strong><small>base sintética</small></div>
              </div>
              <div className={s.legend}>{statusData.map(d => <div key={d.label}><span className={s.legendColor} style={{background:d.color}}/><span>{d.label}</span><strong>{d.count}</strong><small>{Math.round(d.count/Math.max(stats.total,1)*100)}%</small></div>)}</div>
            </div>
            <div className={s.insightsFooter}><UIIcon name="shield" size={17}/><span>Informações fictícias para homologação visual. Sem dados reais da igreja.</span></div>
          </section>

          <section className={s.evolution} aria-labelledby="evolution-heading">
            <div className={s.blockHeader}><div><span className={s.blockKicker}>HISTÓRICO DOS REGISTROS</span><h2 id="evolution-heading">Cadastros por ano</h2><p>Ano de entrada dos registros sintéticos disponíveis.</p></div><UIIcon name="activity" size={21}/></div>
            <div className={s.yearBars}>{yearly.map(({year,count}) => <div key={year} className={s.yearColumn}><div className={s.yearBarTrack}><div className={s.yearBar} style={{height:`${Math.max(9,100*count/maxYearly)}%`}}><span>{count}</span></div></div><strong>{year}</strong></div>)}</div>
          </section>

          <section className={s.quickSection} aria-labelledby="quick-heading">
            <div className={s.inlineHeading}><div><span className={s.blockKicker}>ACESSO DIRETO</span><h2 id="quick-heading">Seu próximo passo</h2></div></div>
            <div className={s.quickGrid}>
              <a href={withBasePath("/app/membros/")}><span className={s.quickIcon}><UIIcon name="people"/></span><strong>Localizar uma pessoa</strong><small>Pesquise e consulte registros</small><UIIcon name="arrow" size={17}/></a>
              <a href={withBasePath("/app/secretaria/")}><span className={s.quickIcon}><UIIcon name="layers"/></span><strong>Conferir admissões</strong><small>Documentos e aprovações</small><UIIcon name="arrow" size={17}/></a>
              <a href={withBasePath("/app/membros/carteirinha/")}><span className={s.quickIcon}><UIIcon name="badge"/></span><strong>Gerenciar carteirinhas</strong><small>Emissão e situação atual</small><UIIcon name="arrow" size={17}/></a>
            </div>
          </section>
        </div>

        <aside className={s.rightColumn}>
          <section className={s.queue} aria-labelledby="queue-heading">
            <div className={s.queueHeader}><div><span className={s.blockKicker}>PRIORIDADE DE CUIDADO</span><h2 id="queue-heading">Na sua atenção</h2></div><span className={s.queueCount}>{pending.length}</span></div>
            <p className={s.queueIntro}>Pessoas que aguardam uma etapa de admissão.</p>
            <div className={s.queueList}>
              {nextItems.map(({person,label}) => <div key={person.id} className={s.queueItem}>
                <InitialAvatar person={person}/><span><strong>{person.name}</strong><small>{label}</small></span>
                <span className={s.queueArrow}><UIIcon name="chevron" size={17}/></span>
              </div>)}
              {nextItems.length === 0 && <p className={s.emptyQueue}>Nenhuma admissão pendente.</p>}
            </div>
            <a className={s.queueLink} href={withBasePath("/app/secretaria/")}>Acompanhar todas as admissões <UIIcon name="arrow" size={17}/></a>
          </section>

          <section className={s.helloCard}>
            <div className={s.helloTop}><UIIcon name="spark" size={18}/><span>UM SISTEMA PARA PESSOAS</span></div>
            <h2>Por trás de cada número, <em>uma história.</em></h2>
            <p>Organização é uma forma de cuidado. Toda jornada importa.</p>
            <div className={s.helloPeople}>{members.slice(0,5).map(p => <InitialAvatar key={p.id} person={p} tiny/>)}<span>+{Math.max(0,members.length-5)}</span></div>
          </section>

          <section className={s.serviceCard}>
            <div><UIIcon name="badge" size={20}/><strong>{cardQueue.length} identificações disponíveis</strong></div>
            <p>Membros aprovados que ainda não possuem uma carteirinha ativa.</p>
            <a href={withBasePath("/app/membros/carteirinha/")}>Conferir carteirinhas <UIIcon name="arrow" size={15}/></a>
          </section>
          <div className={s.microNote}><UIIcon name="shield" size={15}/><span>Ambiente de avaliação. As operações não utilizam serviços de produção.</span></div>
        </aside>
      </div>
    </div>
  </AppShell>;
}
