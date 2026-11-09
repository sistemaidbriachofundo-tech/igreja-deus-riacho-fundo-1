"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import {
  beginClientNavigation, finishClientNavigation, hasAppRouter, publishPerfProbe,
  pushAppRoute, shouldInterceptAppNavigation,
} from "../lib/app-navigation";
import { useAppRouterBridge } from "../lib/use-app-router-bridge";
import { withBasePath } from "../lib/paths";
import {
  apiGet, clearToken, isForbidden, isUnauthorized, loadStoredToken, readValidatedSession, type AuthUser,
} from "../lib/api";
import {
  accountInitials, areaAllowed, areasForPreview, areasForRoles, landingForRoles, personaLabel,
  railForRoles, type AppNavKey, type PersonaArea, type RailLink,
} from "../lib/persona-navigation";
import s from "./app-shell.module.css";

export type { AppNavKey };

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

const MOBILE_PRIMARY: readonly AppNavKey[] = ["visao", "membros", "secretaria", "operacao"];

export type PersonaAccessState = {
  kind: "preview" | "pending" | "anonymous" | "held" | "ready";
  roles: string[];
  email: string;
  label: string;
};

const PersonaAccessContext = createContext<PersonaAccessState>({
  kind: "pending", roles: [], email: "", label: "",
});

export function usePersonaAccess(): PersonaAccessState {
  return useContext(PersonaAccessContext);
}

type LoadedAccess =
  | { kind: "anonymous" }
  | { kind: "held" }
  | { kind: "ready"; user: AuthUser };

function mobileItems(menu: readonly PersonaArea[], preview: boolean): PersonaArea[] {
  if (preview) return menu.filter(item => MOBILE_PRIMARY.includes(item.key));
  return menu.slice(0, 4);
}

export function AppNavLink({
  href, className, children, ...rest
}: { href: string; className?: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  return <a {...rest} href={withBasePath(href)} className={className} data-nav="client" onClick={(event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldInterceptAppNavigation(href, event) || !hasAppRouter()) return;
    event.preventDefault();
    beginClientNavigation(href);
    pushAppRoute(href);
  }}>{children}</a>;
}

function RailAnchor({ link }: { link: RailLink }) {
  if (link.external) {
    return <a className={s.menuItem} href={link.href} target="_blank" rel="noopener noreferrer"><UIIcon name={link.icon} size={19}/><span>{link.label}</span><UIIcon name="arrow" size={15}/></a>;
  }
  if (link.href.startsWith("/app")) {
    return <AppNavLink className={s.menuItem} href={link.href}><UIIcon name={link.icon} size={19}/><span>{link.label}</span><UIIcon name="arrow" size={15}/></AppNavLink>;
  }
  return <a className={s.menuItem} href={withBasePath(link.href)}><UIIcon name={link.icon} size={19}/><span>{link.label}</span>{link.href !== "/status/" && <UIIcon name="arrow" size={15}/>}</a>;
}

export function AppShell({
  active, meta, children, editorial = false, viewer,
}: {
  active?: AppNavKey | null;
  meta: string;
  children: ReactNode;
  editorial?: boolean;
  /** Sessão já resolvida. Usada por testes e por quem já confirmou /auth/me. */
  viewer?: AuthUser;
}) {
  const personaMode = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const preview = !personaMode && !viewer;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loaded, setLoaded] = useState<LoadedAccess | null>(viewer ? { kind: "ready", user: viewer } : null);
  const [term, setTerm] = useState("");
  const searchId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const deniedRef = useRef<HTMLHeadingElement>(null);
  const RouterBridge = useAppRouterBridge();

  useEffect(() => {
    finishClientNavigation(window.location.pathname);
    publishPerfProbe();
  }, []);

  useEffect(() => {
    if (preview || viewer) return;
    let mounted = true;
    const token = loadStoredToken();
    if (!token) {
      setLoaded({ kind: "anonymous" });
      return;
    }
    const cached = readValidatedSession(token);
    if (cached) {
      setLoaded({ kind: "ready", user: cached });
      return;
    }
    void apiGet<AuthUser>("/auth/me", token)
      .then(user => { if (mounted) setLoaded({ kind: "ready", user }); })
      .catch((error: unknown) => {
        if (!mounted) return;
        setLoaded(isUnauthorized(error) || isForbidden(error) ? { kind: "anonymous" } : { kind: "held" });
      });
    return () => { mounted = false; };
  }, [preview, viewer]);

  const readyUser = viewer ?? (loaded?.kind === "ready" ? loaded.user : null);
  const roles = readyUser ? readyUser.grants.map(grant => grant.roleCode) : [];
  const accessKind: PersonaAccessState["kind"] = preview
    ? "preview"
    : readyUser
      ? "ready"
      : loaded?.kind === "anonymous"
        ? "anonymous"
        : loaded?.kind === "held"
          ? "held"
          : "pending";
  const menu = preview ? areasForPreview() : accessKind === "ready" ? areasForRoles(roles) : [];
  const rails = railForRoles(roles, preview);
  const allowed = areaAllowed(roles, active, preview);
  const showModule = preview || (accessKind === "ready" && allowed);
  const denied = accessKind === "ready" && !allowed;
  const area = menu.find(item => item.key === active) ?? areasForPreview().find(item => item.key === active);
  const context = area?.ribbon ?? { code: "IGREJA DE DEUS / CHURCH OS", title: "Gestão com propósito.", detail: "ID Riacho 1 · Plataforma administrativa." };
  const filtered = menu.filter(item => (item.label + " " + item.hint).toLocaleLowerCase("pt-BR").includes(term.trim().toLocaleLowerCase("pt-BR")));
  const phone = mobileItems(menu, preview);
  const phoneHasActive = active != null && phone.some(item => item.key === active);
  const shownMeta = showModule ? meta : "Área administrativa";
  const accountEmail = readyUser?.email ?? "";
  const accountLabel = preview
    ? "Ambiente de homologação"
    : accessKind === "ready"
      ? personaLabel(roles)
      : accessKind === "pending"
        ? "Confirmando perfil"
        : "Sessão não confirmada";
  const accountName = preview ? "Perfil de homologação" : accessKind === "ready" ? accountEmail : accountLabel;
  const initials = accessKind === "ready" && accountEmail ? accountInitials(accountEmail) : "ID";
  const accessState: PersonaAccessState = {
    kind: accessKind,
    roles,
    email: accountEmail,
    label: accessKind === "ready" ? personaLabel(roles) : accountLabel,
  };

  function switchPersona() {
    clearToken();
    window.location.assign(withBasePath("/login/"));
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(open => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (paletteOpen) inputRef.current?.focus(); else setTerm(""); }, [paletteOpen]);
  useEffect(() => { if (denied) deniedRef.current?.focus(); }, [denied]);

  return (
    <PersonaAccessContext.Provider value={accessState}>
    <div className={s.frame} data-nav-state={accessKind}>
      {RouterBridge ? <RouterBridge prefetch={menu.map(item => item.href)} /> : null}
      <aside className={s.rail} aria-label="Navegação principal">
        <AppNavLink href="/app/" className={s.brand} aria-label="ID Riacho 1 — painel administrativo">
          <span className={s.brandEmblem} style={{ backgroundImage: `url("${withBasePath("/images/logo-igreja-aprovada.webp")}")` }} role="img" aria-label="Logotipo da Igreja de Deus"/>
          <span className={s.brandText}><strong>ID Riacho 1</strong><small>IGREJA DE DEUS · RIACHO FUNDO I</small></span>
        </AppNavLink>

        <div className={s.railContext}><span className={s.railOnline} /><span><strong>{editorial ? "Estúdio editorial" : "Área administrativa"}</strong><small>{editorial ? "Acesso por perfil · requer API" : preview ? "Demonstração com dados sintéticos" : "Módulos do perfil autenticado"}</small></span></div>
        <span className={s.groupTitle}>PAINEL DE CONTROLE</span>
        <nav className={s.menu} aria-label="Módulos" aria-busy={accessKind === "pending"}>
          {menu.map(item => <AppNavLink key={item.key} href={item.href} className={active === item.key ? s.menuActive : s.menuItem} aria-current={active === item.key ? "page" : undefined}>
            <UIIcon name={item.icon} size={19}/><span>{item.label}</span>{active === item.key && <span className={s.activeIndicator}/>}
          </AppNavLink>)}
          {accessKind === "pending" && <p className={s.menuWait} role="status">Confirmando o perfil antes de listar módulos.</p>}
        </nav>
        <div className={s.railDivider}/>
        <span className={s.groupTitle}>CANAIS E COMUNIDADE</span>
        {rails.map(link => <RailAnchor key={link.href} link={link} />)}

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
            <div>
              <strong>{shownMeta}</strong>
              <span className={s.toolbarEyebrow}>Gestão da Igreja de Deus · Riacho Fundo I</span>
              {accessKind === "ready" && <span className={s.personaLine}>{accountEmail} · {accessState.label}</span>}
            </div>
          </div>
          <button type="button" className={s.commandButton} onClick={() => setPaletteOpen(true)} aria-label="Pesquisar e navegar — Ctrl K" disabled={menu.length === 0}>
            <UIIcon name="search" size={18}/><span>Buscar módulos e páginas...</span><kbd>Ctrl K</kbd>
          </button>
          <div className={s.toolbarRight}>
            {showModule && <AppNavLink className={s.toolbarAlerts} href="/app/#avisos" aria-label="Ir para avisos no painel"><UIIcon name="bell" size={21}/><span aria-hidden="true"/></AppNavLink>}
            <span className={s.toolbarDivider}/>
            <span className={s.account} aria-hidden="true">{initials}</span>
            <span className={s.accountInfo} aria-label={`${accountName}, ${accountLabel}`}><strong>{accountName}</strong><small>{accountLabel}</small></span>
            <button type="button" className={s.switchPersona} onClick={switchPersona} title="Trocar perfil de homologação" aria-label="Sair e trocar perfil de homologação">
              <UIIcon name="refresh" size={16}/><span>Sair</span>
            </button>
          </div>
        </header>
        {showModule && active !== "visao" && active != null && <div className={s.workspaceRibbon}>
          {/* Ilustração vetorial original; não representa fotografias de pessoas. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBasePath("/images/church-os-art.svg")} alt="" className={s.ribbonArt} aria-hidden="true" />
          <div className={s.ribbonCopy}><span>{context.code}</span><strong>{context.title}</strong><small>{context.detail}</small></div>
          <span className={s.ribbonSeal}><UIIcon name="spark" size={23}/></span>
        </div>}
        <main className={s.content}>
          {showModule && children}
          {accessKind === "pending" && <p className={s.holdNote} role="status">Confirmando seu perfil. Os módulos restritos ficam ocultos até a sessão responder.</p>}
          {denied && <section className={s.denied} role="alert" data-nav-denied={active ?? "rota"}>
            <h1 tabIndex={-1} ref={deniedRef}>Este perfil não abre esta área</h1>
            <p>O menu mostra só o que o servidor autoriza para {accessState.label}. O módulo não foi carregado. Uma consulta direta à API, sem este papel, recebe 403.</p>
            <AppNavLink href={landingForRoles(roles)}>Voltar ao início do perfil</AppNavLink>
          </section>}
          {(accessKind === "anonymous" || accessKind === "held") && <p className={s.holdNote} role="alert">Não confirmamos seu perfil. Nada restrito foi exibido.</p>}
        </main>
      </div>

      <nav className={s.mobileNav} aria-label="Navegação principal no celular">
        {phone.map(item => <AppNavLink key={item.key} href={item.href} className={active === item.key ? s.mobileActive : s.mobileItem} aria-current={active === item.key ? "page" : undefined}>
          <UIIcon name={item.icon} size={20}/><span>{item.short}</span>
        </AppNavLink>)}
        <button type="button" className={active && !phoneHasActive ? s.mobileActive : s.mobileItem}
          aria-label="Mais módulos e páginas" aria-haspopup="dialog" aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(true)}>
          <UIIcon name="more" size={20}/><span>Mais</span>
        </button>
      </nav>

      {paletteOpen && <div className={s.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
        <section className={s.commandModal} role="dialog" aria-modal="true" aria-labelledby={searchId}>
          <label htmlFor={searchId} className={s.commandSearch}><UIIcon name="search" size={22}/><input ref={inputRef} id={searchId} value={term} onChange={event => setTerm(event.target.value)} placeholder="Buscar módulos e páginas..." autoComplete="off"/><button type="button" aria-label="Fechar busca" onClick={() => setPaletteOpen(false)}><UIIcon name="close" size={18}/></button></label>
          <span className={s.commandTitle}>NAVEGAÇÃO</span>
          <div className={s.commandList}>
            {filtered.map(item => <AppNavLink key={item.key} href={item.href}><span className={s.commandListIcon}><UIIcon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.hint}</small></span><UIIcon name="arrow" size={16}/></AppNavLink>)}
            {filtered.length === 0 && <p className={s.commandEmpty}>Nenhuma página encontrada. Tente outro termo.</p>}
          </div>
          <div className={s.commandFooter}><kbd>Esc</kbd> para fechar <span>·</span> <kbd>Ctrl K</kbd> para abrir</div>
        </section>
      </div>}
    </div>
    </PersonaAccessContext.Provider>
  );
}
