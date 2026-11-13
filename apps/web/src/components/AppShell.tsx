"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { AnchorHTMLAttributes, CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  beginClientNavigation, finishClientNavigation, hasAppRouter, publishPerfProbe,
  pushAppRoute, shouldInterceptAppNavigation,
} from "../lib/app-navigation";
import { useAppRouterBridge } from "../lib/use-app-router-bridge";
import { withBasePath } from "../lib/paths";
import { officialLogoAsset } from "../lib/brand";
import { treasurySectionFromHash, treasurySectionHref, treasurySidebarItems, type TreasurySection } from "../lib/treasury-navigation";
import {
  SESSION_UNAUTHORIZED_EVENT, apiGet, isForbidden, isUnauthorized, loadStoredToken, readValidatedSession, signOutSession, type AuthUser,
} from "../lib/api";
import { readPanel } from "../lib/panel-read";
import {
  SHELL_MINISTRY_STORAGE_KEY, SHELL_RAIL_STORAGE_KEY,
  accountInitials, areaAllowed, canListMinistries,
  isMemberOnly, isMinistryGroupKey, landingForRoles, ministryContextHref, ministrySubmenu, parseMinistryNav,
  personaLabel, readGroupPreference, readRailPreference, shellAreasForRoles,
  type AppNavKey, type MinistryNavItem, type PersonaArea,
} from "../lib/persona-navigation";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import { useDialogLifecycle } from "./ui/dialog";
import { dsColor, dsGrid } from "./ui/tokens";
import s from "./app-shell.module.css";

export type { AppNavKey };

type GlyphName = "grid" | "people" | "layers" | "badge" | "search" | "plus" | "arrow" |
  "chevron" | "command" | "spark" | "clock" | "check" | "close" | "home" | "shield" |
  "activity" | "calendar" | "book" | "wallet" | "bell" | "filter" | "download" | "refresh" |
  "family" | "more" | "mail" | "settings" | "menu" | "logout";

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
    wallet: <><path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h15v-4"/><path d="M3 7h17v3h-6a3 3 0 0 0 0 6h6v-6M16 13h1"/></>,
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
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    logout: <><path d="M10 7V5H4v14h6v-2"/><path d="M10 12h10m-3-3 3 3-3 3"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">{paths[name]}</svg>;
}

const MOBILE_PRIMARY: readonly AppNavKey[] = ["visao", "secretaria", "tesouraria", "ministerios"];

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

function mobileItems(menu: readonly PersonaArea[]): PersonaArea[] {
  const preferred = MOBILE_PRIMARY.flatMap(key => {
    const item = menu.find(entry => entry.key === key);
    return item ? [item] : [];
  });
  if (preferred.length >= 3) return preferred.slice(0, 4);
  return [...preferred, ...menu.filter(item => !preferred.includes(item))].slice(0, 3);
}

export function AppNavLink({
  href, className, children, onNavigate, ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  return <a {...rest} href={withBasePath(href)} className={className} data-nav="client" onClick={(event: MouseEvent<HTMLAnchorElement>) => {
    onNavigate?.();
    if (!shouldInterceptAppNavigation(href, event) || !hasAppRouter()) return;
    event.preventDefault();
    beginClientNavigation(href);
    pushAppRoute(href);
  }}>{children}</a>;
}

function focusRailItem(current: HTMLElement, direction: 1 | -1 | "first" | "last") {
  const root = current.closest("[data-rail-keys]");
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")]
    .filter(element => element.getClientRects().length > 0);
  const index = items.indexOf(current);
  if (index < 0) return;
  const next = direction === "first" ? items[0]
    : direction === "last" ? items[items.length - 1]
      : items[index + direction];
  next?.focus();
}

export function AppShell({
  active, meta, children, editorial = false, viewer, secretarySection,
}: {
  active?: AppNavKey | null;
  meta: string;
  children: ReactNode;
  editorial?: boolean;
  secretarySection?: "resumo" | "pessoas" | "admissoes";
  /** Sessão já resolvida. Usada por testes e por quem já confirmou /auth/me. */
  viewer?: AuthUser;
}) {
  const personaMode = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const preview = !personaMode && !viewer;
  const childActive = active === "ministerios" || active === "escalas" || active === "atmosfera";
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loaded, setLoaded] = useState<LoadedAccess | null>(viewer ? { kind: "ready", user: viewer } : null);
  const [term, setTerm] = useState("");
  const [viewport, setViewport] = useState<"unknown" | "desktop" | "mobile">("unknown");
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ministryOpen, setMinistryOpen] = useState(childActive);
  const [treasurySection, setTreasurySection] = useState<TreasurySection>("visao");
  const [ministries, setMinistries] = useState<MinistryNavItem[] | null>(null);
  const [ministryNote, setMinistryNote] = useState("");
  const { confirm, confirmation } = useActionConfirmation();
  const [railReady, setRailReady] = useState(false);
  const searchId = useId();
  const ministryListId = useId();
  const paletteRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deniedRef = useRef<HTMLHeadingElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef(viewport);
  const drawerRef = useRef(drawerOpen);
  const RouterBridge = useAppRouterBridge();
  viewportRef.current = viewport;
  drawerRef.current = drawerOpen;
  useDialogLifecycle(paletteOpen, () => setPaletteOpen(false), paletteRef);

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
  const memberShell = !preview && accessKind === "ready" && isMemberOnly(roles);
  const menu = preview
    ? shellAreasForRoles(roles, true)
    : accessKind === "ready"
      ? shellAreasForRoles(roles)
      : [];
  const allowed = areaAllowed(roles, active, preview);
  const showModule = preview || (accessKind === "ready" && allowed);
  const denied = accessKind === "ready" && !allowed;
  const filtered = menu.filter(item => (item.label + " " + item.hint).toLocaleLowerCase("pt-BR").includes(term.trim().toLocaleLowerCase("pt-BR")));
  const phone = mobileItems(menu);
  const phoneActive = active === "carteirinha" && phone.some(item => item.key === "secretaria") ? "secretaria" : active;
  const phoneHasActive = phoneActive != null && phone.some(item => item.key === phoneActive);
  const shownMeta = showModule ? meta : "Área administrativa";
  const accountEmail = readyUser?.email ?? "";
  const accountLabel = preview
    ? "Acesso local"
    : accessKind === "ready"
      ? personaLabel(roles)
      : accessKind === "pending"
        ? "Confirmando perfil"
        : "Sessão não confirmada";
  const accountName = preview ? "Visitante" : accessKind === "ready"
    ? (/(@example\.test$|\.demo@)/i.test(accountEmail) ? "Conta de homologação" : accountEmail)
    : accountLabel;
  const initials = accessKind === "ready" && accountEmail ? accountInitials(accountEmail) : "ID";
  const accessState: PersonaAccessState = {
    kind: accessKind,
    roles,
    email: accountEmail,
    label: accessKind === "ready" ? personaLabel(roles) : accountLabel,
  };

  const roleKey = roles.join("|");
  useEffect(() => {
    if (active !== "tesouraria") return;
    const sync = () => setTreasurySection(treasurySectionFromHash(window.location.hash, roleKey ? roleKey.split("|") : []));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [active, roleKey]);
  const treasuryChildren = treasurySidebarItems(roles);
  const showMinistries = canListMinistries(roles, preview);
  const ministryEntries = showMinistries ? ministrySubmenu(menu, ministries) : [];
  const secretaryMenu = menu.some(item => item.key === "secretaria");
  const credentialMenu = menu.find(item => item.key === "carteirinha");
  const secretaryChildren = [
    ...(preview || roles.some(role => role === "SECRETARIA" || role === "PLATFORM_ADMIN")
      ? [{ key: "pessoas", title: "Pessoas", href: "/app/secretaria/pessoas/", icon: "people" as const }]
      : []),
    { key: "admissoes", title: "Admissões", href: "/app/secretaria/admissoes/", icon: "layers" as const },
    ...(credentialMenu ? [{ key: "carteirinha", title: "Carteirinhas", href: credentialMenu.href, icon: "badge" as const }] : []),
  ];
  const menuBlocks: Array<{ kind: "link"; item: PersonaArea } | { kind: "secretary" } | { kind: "treasury" } | { kind: "ministries" } | { kind: "divider" }> = [];
  let ministryInserted = false;
  let supportingSectionInserted = false;
  for (const item of menu) {
    if (item.key === "secretaria") {
      menuBlocks.push({ kind: "secretary" });
      continue;
    }
    if (secretaryMenu && item.key === "carteirinha") continue;
    if (item.key === "tesouraria") {
      menuBlocks.push({ kind: "treasury" });
      continue;
    }
    if (isMinistryGroupKey(item.key)) {
      if (!ministryInserted && showMinistries) {
        menuBlocks.push({ kind: "ministries" });
        ministryInserted = true;
      }
      continue;
    }
    if (!supportingSectionInserted && ["acessos", "editorial", "site"].includes(item.key)) {
      menuBlocks.push({ kind: "divider" });
      supportingSectionInserted = true;
    }
    menuBlocks.push({ kind: "link", item });
  }
  const commandMinistries = (ministries ?? []).filter(item => item.name.toLocaleLowerCase("pt-BR").includes(term.trim().toLocaleLowerCase("pt-BR")));
  const railCollapsed = viewport === "desktop" && collapsed;
  const menuExpanded = viewport === "mobile" ? drawerOpen : viewport === "desktop" ? !collapsed : false;
  const menuButtonLabel = viewport === "mobile"
    ? (drawerOpen ? "Fechar menu" : "Abrir menu")
    : viewport === "desktop"
      ? (collapsed ? "Expandir menu" : "Recolher menu")
      : "Abrir menu";
  const shellStyle = {
    "--shell-gold": dsColor.gold,
    "--shell-cream": dsColor.cream,
    "--shell-ink": dsColor.ink,
    "--shell-target": dsGrid.touchTarget,
  } as CSSProperties;

  async function signOut() {
    await signOutSession().catch(() => undefined);
    window.location.assign(withBasePath("/"));
  }
  function afterNavigate() {
    setPaletteOpen(false);
    if (viewportRef.current === "mobile" && drawerRef.current) {
      setDrawerOpen(false);
      menuButtonRef.current?.focus();
    }
  }
  function toggleMenu() {
    if (viewport === "desktop") {
      setCollapsed(value => {
        const next = !value;
        if (next) {
          setMinistryOpen(false);
        } else {
          setMinistryOpen(readGroupPreference(window.localStorage.getItem(SHELL_MINISTRY_STORAGE_KEY), childActive));
        }
        window.localStorage.setItem(SHELL_RAIL_STORAGE_KEY, next ? "collapsed" : "expanded");
        return next;
      });
      return;
    }
    setDrawerOpen(open => !open);
  }
  function toggleMinistries() {
    setMinistryOpen(open => {
      const next = !open;
      window.localStorage.setItem(SHELL_MINISTRY_STORAGE_KEY, next ? "open" : "closed");
      return next;
    });
  }
  async function askLogout() {
    const accepted = await confirm({
      title: "Sair da sua conta?",
      description: "Sua sessão será encerrada neste navegador. Entre novamente para acessar o painel.",
      action: "Sair da conta",
      cancel: "Continuar no painel",
    });
    if (accepted) signOut();
  }
  function onRailKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const key = event.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
    if (!(event.target instanceof HTMLElement)) return;
    event.preventDefault();
    focusRailItem(event.target, key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : key === "Home" ? "first" : "last");
  }
  useEffect(() => {
    const query = window.matchMedia("(max-width: 970px)");
    const apply = () => setViewport(query.matches ? "mobile" : "desktop");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  useLayoutEffect(() => {
    const rail = readRailPreference(window.localStorage.getItem(SHELL_RAIL_STORAGE_KEY));
    const storedGroup = window.localStorage.getItem(SHELL_MINISTRY_STORAGE_KEY);
    setCollapsed(rail === "collapsed");
    setMinistryOpen(childActive || (rail === "expanded" && readGroupPreference(storedGroup, false)));
    setRailReady(true);
  }, [childActive]);
  useEffect(() => {
    function onLost() {
      setLoaded({ kind: "anonymous" });
    }
    window.addEventListener(SESSION_UNAUTHORIZED_EVENT, onLost);
    return () => window.removeEventListener(SESSION_UNAUTHORIZED_EVENT, onLost);
  }, []);
  useEffect(() => {
    if (!showMinistries || preview) {
      setMinistries(null);
      setMinistryNote("");
      return;
    }
    const token = loadStoredToken();
    if (!token) {
      setMinistries(null);
      setMinistryNote("");
      return;
    }
    let cancelled = false;
    setMinistryNote("");
    void readPanel(token, "/ministries", () => apiGet<unknown>("/ministries", token))
      .then(body => {
        if (cancelled) return;
        setMinistries(parseMinistryNav(body));
        setMinistryNote("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMinistries(null);
        if (isUnauthorized(error) || isForbidden(error)) {
          setMinistryNote("");
          return;
        }
        setMinistryNote("Não foi possível atualizar a lista de ministérios.");
      });
    return () => { cancelled = true; };
  }, [preview, roleKey, showMinistries]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.target instanceof HTMLElement && event.target.closest('dialog[open], [role="dialog"]')) return;
      if ((preview || accessKind === "ready") && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(open => !open);
      }
      if (event.key !== "Escape") return;
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accessKind, preview, paletteOpen, drawerOpen]);
  useEffect(() => { if (paletteOpen) inputRef.current?.focus(); else setTerm(""); }, [paletteOpen]);
  useEffect(() => { if (denied) deniedRef.current?.focus(); }, [denied]);
  useEffect(() => {
    if (viewport === "mobile" && drawerOpen) drawerCloseRef.current?.focus();
  }, [drawerOpen, viewport]);

  function itemLabel(item: PersonaArea): string {
    if (!memberShell) return item.label;
    if (item.key === "carteirinha") return "Minha carteirinha";
    if (item.key === "meu-espaco") return "Minha escala";
    return item.label;
  }
  function renderLogout() {
    return (
      <button type="button" className={s.logoutTrigger} aria-haspopup="dialog" onClick={() => void askLogout()}>
        <UIIcon name="logout" size={16}/><span className={s.menuLabel}>Sair</span>
      </button>
    );
  }

  return (
    <PersonaAccessContext.Provider value={accessState}>
    <div
      className={s.frame}
      style={shellStyle}
      data-nav-state={accessKind}
      data-shell={memberShell ? "membro" : "admin"}
      data-rail={railCollapsed ? "collapsed" : "expanded"}
      data-rail-ready={railReady ? "true" : "false"}
      data-drawer={drawerOpen ? "open" : "closed"}
    >
      {RouterBridge ? <RouterBridge /> : null}
      {viewport === "mobile" && drawerOpen && (
        <button type="button" className={s.backdrop} aria-label="Fechar o menu lateral" onClick={() => { setDrawerOpen(false); menuButtonRef.current?.focus(); }} />
      )}
      <aside id="app-navigation-rail" className={s.rail} aria-label="Navegação principal" data-rail-keys="" onKeyDown={onRailKeyDown}>
        <button type="button" ref={drawerCloseRef} className={s.drawerClose} hidden={viewport !== "mobile"} onClick={() => { setDrawerOpen(false); menuButtonRef.current?.focus(); }}>
          <UIIcon name="close" size={18}/><span>Fechar</span>
        </button>
        <div className={s.railHeader}>
          <AppNavLink href="/app/" className={s.brand} aria-label="ID Riacho 1 — painel administrativo" onNavigate={afterNavigate}>
            {/* SVG oficial já é vetorial e não precisa de otimização raster. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.brandEmblem} src={withBasePath(officialLogoAsset)} width={43} height={48} alt="Logotipo da Igreja de Deus" loading="eager" />
            <span className={s.brandText}><strong>ID Riacho 1</strong><small>Igreja de Deus</small></span>
          </AppNavLink>
          <button type="button" className={s.railCollapse} hidden={viewport !== "desktop"}
            aria-label={collapsed ? "Expandir a barra lateral" : "Recolher a barra lateral"}
            aria-expanded={!collapsed} aria-controls="app-navigation-rail" onClick={toggleMenu}
            title={collapsed ? "Expandir menu" : "Recolher menu"}>
            <UIIcon name="chevron" size={17}/>
          </button>
        </div>

        <p className={s.menuCaption}>{memberShell ? "MINHA ÁREA" : "ÁREA ADMINISTRATIVA"}</p>
        <nav className={s.menu} aria-label="Módulos" aria-busy={accessKind === "pending"}>
          {menuBlocks.map(block => {
            if (block.kind === "divider") return <span key="supporting-separator" className={s.menuDivider}>GESTÃO E CONTEÚDO</span>;
            if (block.kind === "secretary") return (
              <div key="secretaria">
                <AppNavLink href="/app/secretaria/" className={active === "secretaria" && (!secretarySection || secretarySection === "resumo") ? s.menuActive : s.menuItem}
                  aria-current={active === "secretaria" && (!secretarySection || secretarySection === "resumo") ? "page" : undefined} title={railCollapsed ? "Secretaria" : undefined} onNavigate={afterNavigate}>
                  <UIIcon name="layers" size={19}/><span className={s.menuLabel}>Secretaria</span>
                </AppNavLink>
                {!railCollapsed && <div className={s.subList} role="group" aria-label="Submenu da Secretaria">
                  {secretaryChildren.map(item => {
                    const selected = active === "carteirinha" ? item.key === active : active === "secretaria" && item.key === secretarySection;
                    return <AppNavLink key={item.key} href={item.href} className={selected ? s.menuActive : s.subItem} aria-current={selected ? "page" : undefined} onNavigate={afterNavigate}>
                      <UIIcon name={item.icon} size={16}/><span className={s.menuLabel}>{item.title}</span>
                    </AppNavLink>;
                  })}
                </div>}
              </div>
            );
            if (block.kind === "treasury") {
              const currentParent = active === "tesouraria";
              return <div key="tesouraria" className={s.treasuryBlock}>
                <AppNavLink href="/app/tesouraria/"
                  className={currentParent ? s.menuActive : s.menuItem}
                  title={railCollapsed ? "Tesouraria" : undefined} onNavigate={afterNavigate}>
                  <UIIcon name="wallet" size={19}/><span className={s.menuLabel}>Tesouraria</span>
                  {currentParent && <span className={s.activeIndicator}/>}
                </AppNavLink>
                {!railCollapsed && treasuryChildren.length > 0 && <div className={s.subList}
                  role="group" aria-label="Submenu da Tesouraria">
                  {treasuryChildren.map(item => {
                    const selected = currentParent && treasurySection === item.section;
                    return <a key={item.section} href={withBasePath(treasurySectionHref(item.section))}
                      className={selected ? s.subSelected : s.subItem}
                      aria-current={selected ? "page" : undefined}
                      onClick={() => { setTreasurySection(item.section); afterNavigate(); }}>
                      <UIIcon name={item.icon} size={16}/><span className={s.menuLabel}>{item.label}</span>
                    </a>;
                  })}
                </div>}
              </div>;
            }
            if (block.kind === "link") {
              const item = block.item;
              const label = itemLabel(item);
              return <AppNavLink key={item.key} href={item.href} className={active === item.key ? s.menuActive : s.menuItem} aria-current={active === item.key ? "page" : undefined} title={railCollapsed ? label : undefined} onNavigate={afterNavigate}>
                <UIIcon name={item.icon} size={19}/><span className={s.menuLabel}>{label}</span>{active === item.key && <span className={s.activeIndicator}/>}
              </AppNavLink>;
            }
            return <div key="ministerios" className={s.ministryBlock} data-open={ministryOpen ? "true" : "false"}>
              <button type="button" className={s.ministryToggle} data-nav-group="ministerios" data-current={active != null && isMinistryGroupKey(active) ? "true" : "false"} aria-expanded={ministryOpen} aria-controls={ministryListId} title={railCollapsed ? "Ministérios" : undefined} onClick={toggleMinistries}>
                <UIIcon name="family" size={19}/><span className={s.menuLabel}>Ministérios</span><UIIcon name="chevron" size={15}/>
              </button>
              <div id={ministryListId} className={s.subList} role="group" aria-label="Ministérios autorizados" hidden={!ministryOpen}>
                {ministryEntries.map(entry => <AppNavLink key={entry.key} href={entry.href} className={s.subItem} onNavigate={afterNavigate}>
                  <UIIcon name={entry.icon} size={16}/><span className={s.menuLabel}>{entry.label}</span>
                </AppNavLink>)}
                {ministryNote && <p className={s.menuWait} role="status">{ministryNote}</p>}
              </div>
            </div>;
          })}
        </nav>

      </aside>

      <div className={s.mainColumn}>
        <header className={s.toolbar}>
          <div className={s.toolbarIdentity}>
            <button type="button" ref={menuButtonRef} className={s.hamburger} aria-expanded={menuExpanded} aria-controls="app-navigation-rail" aria-label={menuButtonLabel} onClick={toggleMenu}>
              <UIIcon name="menu" size={20}/>
            </button>
            {/* SVG oficial já é vetorial e não precisa de otimização raster. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.smallLogo} src={withBasePath(officialLogoAsset)} width={36} height={40} alt="" loading="eager" />
            <div>
              <strong>{shownMeta}</strong>
              <span className={s.toolbarEyebrow}>{memberShell ? "Igreja de Deus · Riacho Fundo I" : "Administração · Riacho Fundo I"}</span>
              
            </div>
          </div>
          <button type="button" className={s.commandButton} onClick={() => setPaletteOpen(true)} aria-label="Buscar no painel" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" disabled={menu.length === 0}>
            <UIIcon name="search" size={18}/><span>Buscar no painel</span>
          </button>
          <div className={s.toolbarRight}>
            {showModule && <AppNavLink className={s.toolbarAlerts} href="/app/#avisos" aria-label="Ver pendências"><UIIcon name="bell" size={20}/><strong>Avisos</strong></AppNavLink>}
            <span className={s.profileCluster}>
              <span className={s.account} aria-hidden="true">{initials}</span>
              <span className={s.accountInfo} aria-label={`${accountEmail || accountName}, ${accountLabel}`} title={accountEmail || accountName}><strong>{accountName}</strong><small>{accountLabel}</small></span>
            </span>
            {renderLogout()}
          </div>
        </header>
        <main className={s.content}>
          {showModule && children}
          {accessKind === "pending" && <div className={s.accessLoading} role="status" aria-label="Carregando painel"><span className={s.accessSpinner} aria-hidden="true" /><span className={s.screenReaderOnly}>Carregando painel</span></div>}
          {denied && <section className={s.denied} role="alert" data-nav-denied={active ?? "rota"}>
            <h1 tabIndex={-1} ref={deniedRef}>Seu perfil não tem acesso a esta página</h1>
            <AppNavLink href={landingForRoles(roles)}>Voltar ao início</AppNavLink>
          </section>}
          {accessKind === "anonymous" && <div className={s.holdNote}><p>Entre na sua conta para acessar o painel.</p><AppNavLink href="/login/">Ir para o login</AppNavLink></div>}
          {accessKind === "held" && <p className={s.holdNote} role="alert">Não foi possível verificar seu acesso. Atualize a página para tentar de novo.</p>}
        </main>
      </div>

      {menu.length > 0 && <nav className={s.mobileNav} aria-label="Navegação principal no celular">
        {phone.map(item => <AppNavLink key={item.key} href={item.href} className={phoneActive === item.key ? s.mobileActive : s.mobileItem} aria-current={active === item.key ? "page" : undefined} onNavigate={afterNavigate}>
          <UIIcon name={item.icon} size={20}/><span>{memberShell && item.key === "meu-espaco" ? "Escala" : memberShell && item.key === "carteirinha" ? "Carteira" : item.short}</span>
        </AppNavLink>)}
        <button type="button" className={active && !phoneHasActive ? s.mobileActive : s.mobileItem}
          aria-label="Mais módulos e páginas" aria-haspopup="dialog" aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(true)}>
          <UIIcon name="more" size={20}/><span>Mais</span>
        </button>
      </nav>}

      {confirmation}

      {paletteOpen && <div className={s.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
        <section ref={paletteRef} tabIndex={-1} className={s.commandModal} role="dialog" aria-modal="true" aria-label={viewport === "mobile" ? "Mais áreas do painel" : "Buscar no painel"}>
          <div className={s.commandSearch}><label htmlFor={searchId} aria-label="Buscar página ou ministério"><UIIcon name="search" size={20}/></label><input ref={inputRef} id={searchId} value={term} onChange={event => setTerm(event.target.value)} placeholder="Buscar página ou ministério" aria-label="Buscar página ou ministério" autoComplete="off"/><button type="button" aria-label="Fechar busca" onClick={() => setPaletteOpen(false)}><UIIcon name="close" size={18}/></button></div>
          <div className={s.commandList}>
            {filtered.map(item => <AppNavLink key={item.key} href={item.href} onNavigate={afterNavigate}><span className={s.commandListIcon}><UIIcon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.hint}</small></span><UIIcon name="arrow" size={16}/></AppNavLink>)}
            {treasuryChildren.filter(item => !term.trim() || (`Tesouraria financeiro ${item.label}`).toLocaleLowerCase("pt-BR").includes(term.trim().toLocaleLowerCase("pt-BR"))).map(item =>
              <a key={`financeiro-${item.section}`} href={withBasePath(treasurySectionHref(item.section))}
                onClick={afterNavigate}>
                <span className={s.commandListIcon}><UIIcon name={item.icon}/></span>
                <span><strong>Tesouraria · {item.label}</strong><small>Área financeira da congregação</small></span>
                <UIIcon name="arrow" size={16}/>
              </a>
            )}
            {showMinistries && commandMinistries.map(item => <AppNavLink key={item.id} href={ministryContextHref(item)} onNavigate={afterNavigate}><span className={s.commandListIcon}><UIIcon name="family"/></span><span><strong>{item.name}</strong></span><UIIcon name="arrow" size={16}/></AppNavLink>)}
            {filtered.length === 0 && commandMinistries.length === 0 && <p className={s.commandEmpty}>Nenhuma página encontrada. Tente outro termo.</p>}
          </div>
        </section>
      </div>}
    </div>
    </PersonaAccessContext.Provider>
  );
}
