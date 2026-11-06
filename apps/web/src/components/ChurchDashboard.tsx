"use client";

import { useMemo } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { withBasePath } from "../lib/paths";
import { summarize, STAGE_LABEL } from "../lib/church-synthetic";
import { useChurchRecords } from "../lib/use-church-records";
import {
  currentPublishedEvents,
  formatPortalDate,
  parsePublishedHome,
} from "../lib/portal-live-data";
import { usePublishedResource } from "../lib/use-published-resource";
import s from "./church-dashboard.module.css";

const youtubeUrl = "https://www.youtube.com/@IDBRiachoFundo1";

const quickActions = [
  { label: "Membros", detail: "Consultar pessoas", href: "/app/membros/", icon: "people" },
  { label: "Admissões", detail: "Acompanhar etapas", href: "/app/secretaria/", icon: "layers" },
  { label: "Carteirinhas", detail: "Gerir credenciais", href: "/app/membros/carteirinha/", icon: "badge" },
  { label: "Conteúdo", detail: "Estúdio editorial", href: "/app/editorial/", icon: "book" },
  { label: "Agenda", detail: "Eventos publicados", href: "/eventos/", icon: "calendar" },
  { label: "Ministérios", detail: "Conhecer equipes", href: "/ministerios/", icon: "family" },
  { label: "YouTube", detail: "Canal oficial", href: youtubeUrl, icon: "activity" },
  { label: "Site público", detail: "Ver o portal", href: "/", icon: "home" },
] as const;

function WeekStrip() {
  const week = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit", month: "2-digit", year: "numeric",
      timeZone: "America/Sao_Paulo",
    }).formatToParts(new Date());
    const get = (key: string) => Number(parts.find(p => p.type === key)?.value ?? 0);
    const today = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12));
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86400000);
    const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    return labels.map((label, index) => {
      const date = new Date(monday.getTime() + index * 86400000);
      return {
        label, day: String(date.getUTCDate()).padStart(2, "0"),
        isToday: date.getTime() === today.getTime(),
      };
    });
  }, []);

  return <div className={s.weekStrip} aria-label="Dias da semana atual">
    {week.map(day => <div className={day.isToday ? s.weekToday : s.weekDay} key={day.label}
      aria-current={day.isToday ? "date" : undefined}>
      <span>{day.label}</span><strong>{day.day}</strong>
    </div>)}
  </div>;
}

export function ChurchDashboard() {
  const { members } = useChurchRecords();
  const stats = useMemo(() => summarize(members), [members]);
  const { status: agendaStatus, data: publishedHome } =
    usePublishedResource("/public/home", parsePublishedHome);
  const upcoming = publishedHome
    ? currentPublishedEvents(publishedHome.featuredEvents).slice(0, 3)
    : [];
  const pending = members.filter(member => member.status === "PENDING_ADMISSION");
  const cardQueue = members.filter(member => member.status === "ACTIVE" && member.card !== "ACTIVE");
  const pastoral = pending.filter(member => member.stage === "PASTOR").length;
  const documents = pending.filter(member => member.stage === "DOCUMENTS").length;
  const awaiting = pending.slice(0, 3);

  const metrics = [
    { label: "Pessoas cadastradas", value: stats.total, icon: "people" as const, hint: "Registros da base de teste", tone: "teal" },
    { label: "Membros ativos", value: stats.active, icon: "family" as const, hint: "Cadastros de avaliação", tone: "gold" },
    { label: "Admissões em andamento", value: stats.pending, icon: "layers" as const, hint: "Etapas a acompanhar", tone: "teal" },
    { label: "Carteirinhas ativas", value: stats.issued, icon: "badge" as const, hint: "Credenciais de teste", tone: "mint" },
  ];

  return <AppShell active="visao" meta="Área Administrativa">
    <div className={s.dashboard}>
      <section className={s.hero} aria-labelledby="id-riacho-dashboard-title">
        <div className={s.heroPhoto} aria-hidden="true">
          {/* Foto existente no acervo do projeto. Não afirma programação atual. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBasePath("/images/hero-oficial.jpg")} alt="" fetchPriority="high" />
        </div>
        <div className={s.heroCopy}>
          <span className={s.heroKicker}>GESTÃO MINISTERIAL · RIACHO FUNDO I</span>
          <h1 id="id-riacho-dashboard-title">Bem-vindo ao<br/><em>ID Riacho 1</em></h1>
          <p>Organização, pessoas e ministérios em um só lugar.</p>
          <a href={withBasePath("/app/membros/")} className={s.heroLink}>
            Conhecer o painel de pessoas <UIIcon name="arrow" size={18}/>
          </a>
        </div>
        <span className={s.heroPhotoNote}>FOTO DO ACERVO · IMAGEM DE REFERÊNCIA</span>
      </section>

      <div className={s.sectionIntro}>
        <div><span className={s.miniEyebrow}>PANORAMA DA COMUNIDADE</span><h2>Visão geral</h2></div>
        <span className={s.demoPill}><UIIcon name="shield" size={15}/> Ambiente de demonstração · dados sintéticos</span>
      </div>

      <section className={s.metrics} aria-label="Indicadores calculados da base sintética">
        {metrics.map(item => <article key={item.label} className={s.metric} data-tone={item.tone}>
          <span className={s.metricIcon}><UIIcon name={item.icon} size={27}/></span>
          <div className={s.metricBody}><strong>{item.value}</strong><span>{item.label}</span><small>{item.hint}</small></div>
          <span className={s.metricAccentShape} aria-hidden="true"/>
        </article>)}
      </section>

      <div className={s.middleGrid}>
        <section className={s.panel} aria-labelledby="quick-title">
          <div className={s.panelHeading}>
            <div><span className={s.panelIcon}><UIIcon name="spark" size={19}/></span><h2 id="quick-title">Acesso rápido</h2></div>
            <span className={s.panelCaption}>SEUS MÓDULOS</span>
          </div>
          <div className={s.quickGrid}>
            {quickActions.map(action => {
              const isExternal = action.href.startsWith("https://");
              return <a key={action.label} href={isExternal ? action.href : withBasePath(action.href)}
                target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined}
                className={s.quickAction}>
                <UIIcon name={action.icon} size={27}/>
                <strong>{action.label}</strong>
                <small>{action.detail}</small>
              </a>;
            })}
          </div>
        </section>

        <section className={s.panel} aria-labelledby="tasks-title">
          <div className={s.panelHeading}>
            <div><span className={s.panelIcon}><UIIcon name="layers" size={19}/></span><h2 id="tasks-title">Processos e admissões</h2></div>
            <a href={withBasePath("/app/secretaria/")}>Ver todos <UIIcon name="arrow" size={15}/></a>
          </div>
          <div className={s.processList}>
            {awaiting.length > 0 ? awaiting.map(member => <div className={s.processRow} key={member.id}>
              <span className={s.processAvatar} aria-hidden="true">{member.name.slice(0,1)}</span>
              <span className={s.processText}><strong>{member.name}</strong><small>{STAGE_LABEL[member.stage]}</small></span>
              <span className={s.processBadge}>Em análise</span>
            </div>) : <div className={s.emptyState}>Nenhum processo pendente na base de avaliação.</div>}
          </div>
          <a href={withBasePath("/app/secretaria/")} className={s.panelFooterLink}>Acompanhar etapas e aprovações <UIIcon name="arrow" size={16}/></a>
        </section>

        <section className={s.panel} id="avisos" aria-labelledby="alerts-title">
          <div className={s.panelHeading}>
            <div><span className={s.panelIcon}><UIIcon name="bell" size={19}/></span><h2 id="alerts-title">Na sua atenção</h2></div>
          </div>
          <div className={s.alertList}>
            <a href={withBasePath("/app/secretaria/")} className={s.alertRow}>
              <span className={s.alertDot}/>
              <span><strong>{pastoral} {pastoral === 1 ? "aprovação pastoral" : "aprovações pastorais"}</strong><small>Aguardando decisão na base de teste</small></span>
              <UIIcon name="chevron" size={16}/>
            </a>
            <a href={withBasePath("/app/secretaria/")} className={s.alertRow}>
              <span className={s.alertDot}/>
              <span><strong>{documents} processo{documents === 1 ? "" : "s"} em documentação</strong><small>Conferência administrativa</small></span>
              <UIIcon name="chevron" size={16}/>
            </a>
            <a href={withBasePath("/app/membros/carteirinha/")} className={s.alertRow}>
              <span className={s.alertDot}/>
              <span><strong>{cardQueue.length} credencial{cardQueue.length === 1 ? "" : "is"} a verificar</strong><small>Membros ativos sem carteirinha</small></span>
              <UIIcon name="chevron" size={16}/>
            </a>
          </div>
          <p className={s.alertNote}>Avisos gerados apenas com os registros sintéticos disponíveis.</p>
        </section>
      </div>

      <div className={s.bottomGrid}>
        <a className={s.videoPanel} href={youtubeUrl} target="_blank" rel="noopener noreferrer"
          aria-label="Abrir canal oficial IDB Riacho Fundo I no YouTube">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBasePath("/images/adoracao-oficial.jpg")} alt="" loading="lazy"/>
          <span className={s.youtubeMark} aria-hidden="true">▶</span>
          <span className={s.youtubeText}><strong>ID Riacho 1<br/>no YouTube</strong><small>Mensagens, cultos e conteúdos da nossa igreja.</small></span>
          <span className={s.youtubeGo}>Acessar canal <UIIcon name="arrow" size={16}/></span>
        </a>

        <section className={s.panel} aria-labelledby="calendar-title">
          <div className={s.panelHeading}>
            <div><span className={s.panelIcon}><UIIcon name="calendar" size={19}/></span><h2 id="calendar-title">Agenda da semana</h2></div>
            <a href={withBasePath("/eventos/")}>Ver agenda <UIIcon name="arrow" size={15}/></a>
          </div>
          <WeekStrip/>
          <div className={s.agendaSummary}>
            {upcoming.length > 0
              ? upcoming.map(event => <div className={s.agendaLine} key={event.id}>
                  <span className={s.agendaDate}><strong>{formatPortalDate(event.startsAt).day}</strong>{formatPortalDate(event.startsAt).month}</span>
                  <span><strong>{event.name}</strong><small>{formatPortalDate(event.startsAt).dayAndTime}</small></span>
                </div>)
              : <p>{agendaStatus === "loading"
                  ? "Consultando a programação publicada…"
                  : "A agenda oficial será exibida quando os eventos forem publicados."}</p>}
          </div>
        </section>
      </div>

      <div className={s.footnote}><UIIcon name="shield" size={17}/>
        <span>ID Riacho 1 · Prévia administrativa. Dados de membros, admissões e carteirinhas são fictícios; a agenda mostra apenas publicações oficialmente liberadas.</span>
      </div>
    </div>
  </AppShell>;
}
