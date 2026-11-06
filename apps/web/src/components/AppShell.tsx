"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { withBasePath } from "../lib/paths";
import s from "./app-shell.module.css";

export type AppNavKey = "visao" | "membros" | "secretaria" | "carteirinha" | "editorial" | "demo";

type GlyphName = "grid" | "people" | "layers" | "badge" | "search" | "plus" | "arrow" |
  "chevron" | "command" | "spark" | "clock" | "check" | "close" | "home" | "shield" |
  "activity" | "calendar" | "book" | "bell" | "filter" | "download" | "refresh" |
  "family" | "more" | "mail" | "settings";

export function UIIcon({ name, size = 20 }: { name: GlyphName; size?: number }) {
  const paths: Record<GlyphName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1H3Z"/><path d="M16 5.6a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 4 5"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    badge: <><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="11" r="2"/><path d="M6 16a3.2 3.2 0 0 1 5 0M14 10h4M14 14h4"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 5 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    command: <><path d="M9 7V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V7"/></>,
    spark: <><path d="m12 2 2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1L12 2Z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    home: <><path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M9 21v-8h6v8"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    activity: <path d="M2 12h5l3-8 4 16 3-8h5"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/></>,
    book: <><path d="M12 6c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V5c-3-1-7-1-10 1ZM12 6v15"/></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 6-3 7-3 8h18c0-1-3-2-3-8ZM10 21h4"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
    refresh: <><path d="M20 7V3l-3 3a8 8 0 1 0 2 10M20 3v5h-5"/></>,
    family: <><circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M3 21v-3a5 5 0 0 1 10 0v3M14 14a5 5 0 0 1 7 4v3"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    mail: <><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m10 2-.5 2-2 1-2-.8-2 3 1.5 1.5-.2 2.3-1.8 1 1 4 2.2.1 1.4 1.7-.4 2.1 3.8 1 1.1-1.8 2.2-.4 1.7 1.3 3-2-1.1-2 1-2 2.2-.3V9l-2-.4-1-2 1-2-3-2-1.8 1.4-2.2-.4L10 2Z"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">{paths[name]}</svg>;
}

const NAV: { key: AppNavKey; href: string; label: string; short: string; icon: GlyphName; hint: string }[] = [
  { key: "visao", href: "/app/", label: "Painel", short: "Painel", icon: "home", hint: "Visão geral, indicadores e atividades" },
  { key: "membros", href: "/app/membros/", label: "Membros e famílias", short: "Pessoas", icon: "people", hint: "Pessoas, famílias e cadastros" },
  { key: "secretaria", href: "/app/secretaria/", label: "Secretaria", short: "Secretaria", icon: "layers", hint: "Admissão, processos e documentos" },
  { key: "carteirinha", href: "/app/membros/carteirinha/", label: "Carteirinhas", short: "Carteira", icon: "badge", hint: "Emitir e gerenciar credenciais" },
  { key: "editorial", href: "/app/editorial/", label: "Mídia e conteúdo", short: "Conteúdo", icon: "book", hint: "Estúdio editorial, notícias, eventos e ministérios" },
];

export function AppShell({ active, meta, children, editorial = false }: { active?: AppNavKey | null; meta: string; children: ReactNode; editorial?: boolean }) {
  const context = active === "membros" ? { code: "01 / PESSOAS", title: "Conexões que importam.", detail: "Gestão de pessoas e famílias." } : active === "secretaria" ? { code: "02 / JORNADAS", title: "Cuidar de cada etapa.", detail: "Secretaria e processos." } : active === "carteirinha" ? { code: "03 / IDENTIDADE", title: "Pertencimento com cuidado.", detail: "Credenciais e registros." } : active === "editorial" ? { code: "04 / COMUNICAÇÃO", title: "Histórias que edificam.", detail: "Conteúdo oficial da igreja." } : { code: "IGREJA DE DEUS / CHURCH OS", title: "Gestão com propósito.", detail: "ID Riacho 1 · Plataforma administrativa." };
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [term, setTerm] = useState("");
  const searchId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = NAV.filter(item => (item.label + " " + item.hint).toLocaleLowerCase("pt-BR").includes(term.trim().toLocaleLowerCase("pt-BR")));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(open => !open);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (paletteOpen) inputRef.current?.focus(); else setTerm(""); }, [paletteOpen]);

  return (
    <div className={s.frame}>
      <aside className={s.rail} aria-label="Navegação principal">
        <a href={withBasePath("/app/")} className={s.brand} aria-label="ID Riacho 1 — painel administrativo">
          <span className={s.brandEmblem} style={{ backgroundImage: `url("${withBasePath("/images/logo-igreja-aprovada.webp")}")` }} role="img" aria-label="Logotipo da Igreja de Deus"/>
          <span className={s.brandText}><strong>ID Riacho 1</strong><small>IGREJA DE DEUS · RIACHO FUNDO I</small></span>
        </a>

        <div className={s.railContext}><span className={s.railOnline} /><span><strong>{editorial ? "Estúdio editorial" : "Área administrativa"}</strong><small>{editorial ? "Acesso por perfil · requer API" : "Demonstração com dados sintéticos"}</small></span></div>
        <span className={s.groupTitle}>PAINEL DE CONTROLE</span>
        <nav className={s.menu} aria-label="Módulos">
          {NAV.map(item => <a key={item.key} href={withBasePath(item.href)} className={active === item.key ? s.menuActive : s.menuItem} aria-current={active === item.key ? "page" : undefined}>
            <UIIcon name={item.icon} size={19}/><span>{item.label}</span>{active === item.key && <span className={s.activeIndicator}/>}
          </a>)}
        </nav>
        <div className={s.railDivider}/>
        <span className={s.groupTitle}>CANAIS E COMUNIDADE</span>
        <a className={s.menuItem} href={withBasePath("/eventos/")}><UIIcon name="calendar" size={19}/><span>Agenda pública</span><UIIcon name="arrow" size={15}/></a>
        <a className={s.menuItem} href={withBasePath("/ministerios/")}><UIIcon name="family" size={19}/><span>Ministérios</span><UIIcon name="arrow" size={15}/></a>
        <a className={s.menuItem} href={withBasePath("/")}><UIIcon name="home" size={19}/><span>Portal da igreja</span><UIIcon name="arrow" size={15}/></a>
        <a className={s.menuItem} href={withBasePath("/status/")}><UIIcon name="activity" size={19}/><span>Evolução do sistema</span></a>
        <a className={s.menuItem} href="https://www.youtube.com/@IDBRiachoFundo1" target="_blank" rel="noopener noreferrer"><UIIcon name="activity" size={19}/><span>Canal da igreja</span><UIIcon name="arrow" size={15}/></a>

        <div className={s.railBottom}>
          <div className={s.verseMark}><UIIcon name="layers" size={27}/></div>
          <p><strong>ID Riacho 1</strong><small>Gestão ministerial</small></p>
          <span>IGREJA DE DEUS · RIACHO FUNDO I</span>
        </div>
      </aside>

      <div className={s.mainColumn}>
        <header className={s.toolbar}>
          <div className={s.toolbarIdentity}>
            <span className={s.smallLogo} style={{ backgroundImage: `url("${withBasePath("/images/logo-igreja-aprovada.webp")}")` }} />
            <div><strong>{meta}</strong><span className={s.toolbarEyebrow}>Gestão da Igreja de Deus · Riacho Fundo I</span></div>
          </div>
          <button type="button" className={s.commandButton} onClick={() => setPaletteOpen(true)} aria-label="Pesquisar e navegar — Ctrl K">
            <UIIcon name="search" size={18}/><span>Buscar membros, módulos, eventos...</span><kbd>Ctrl K</kbd>
          </button>
          <div className={s.toolbarRight}>
            <a className={s.toolbarAlerts} href={withBasePath("/app/#avisos")} aria-label="Ir para avisos no painel"><UIIcon name="bell" size={21}/><span aria-hidden="true"/></a>
            <span className={s.toolbarDivider}/>
            <span className={s.account} aria-label="Identificação visual da área de demonstração">ID</span>
            <span className={s.accountInfo}><strong>ID Riacho 1</strong><small>{editorial ? "Estúdio editorial" : "Ambiente de teste"}</small></span>
          </div>
        </header>
        {active !== "visao" && <div className={s.workspaceRibbon}>
          {/* Ilustração vetorial original; não representa fotografias de pessoas. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBasePath("/images/church-os-art.svg")} alt="" className={s.ribbonArt} aria-hidden="true" />
          <div className={s.ribbonCopy}><span>{context.code}</span><strong>{context.title}</strong><small>{context.detail}</small></div>
          <span className={s.ribbonSeal}><UIIcon name="spark" size={23}/></span>
        </div>}
        <main className={s.content}>{children}</main>
      </div>

      <nav className={s.mobileNav} aria-label="Navegação principal no celular">
        {NAV.map(item => <a key={item.key} href={withBasePath(item.href)} className={active === item.key ? s.mobileActive : s.mobileItem} aria-current={active === item.key ? "page" : undefined}>
          <UIIcon name={item.icon} size={20}/><span>{item.short}</span>
        </a>)}
      </nav>

      {paletteOpen && <div className={s.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
        <section className={s.commandModal} role="dialog" aria-modal="true" aria-labelledby={searchId}>
          <label htmlFor={searchId} className={s.commandSearch}><UIIcon name="search" size={22}/><input ref={inputRef} id={searchId} value={term} onChange={event => setTerm(event.target.value)} placeholder="Buscar páginas, módulos, ações..." autoComplete="off"/><button type="button" aria-label="Fechar busca" onClick={() => setPaletteOpen(false)}><UIIcon name="close" size={18}/></button></label>
          <span className={s.commandTitle}>NAVEGAÇÃO</span>
          <div className={s.commandList}>
            {filtered.map(item => <a key={item.key} href={withBasePath(item.href)}><span className={s.commandListIcon}><UIIcon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.hint}</small></span><UIIcon name="arrow" size={16}/></a>)}
            {filtered.length === 0 && <p className={s.commandEmpty}>Nenhuma página encontrada. Tente outro termo.</p>}
          </div>
          <div className={s.commandFooter}><kbd>Esc</kbd> para fechar <span>·</span> <kbd>Ctrl K</kbd> para abrir</div>
        </section>
      </div>}
    </div>
  );
}
