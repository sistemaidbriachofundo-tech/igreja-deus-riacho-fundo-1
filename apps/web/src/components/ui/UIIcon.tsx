import type { ReactNode } from "react";

export type GlyphName = "grid" | "people" | "layers" | "badge" | "search" | "plus" | "arrow" |
  "chevron" | "command" | "spark" | "clock" | "check" | "close" | "home" | "shield" |
  "activity" | "calendar" | "roster" | "book" | "wallet" | "bell" | "filter" | "download" | "refresh" |
  "family" | "more" | "mail" | "settings" | "menu" | "logout" | "camera" | "birthday" | "month" | "whatsapp" | "map" | "pin" | "church" | "minus" | "expand" | "target" | "ticket" | "lock" | "eye" | "file";

export function UIIcon({ name, size = 20 }: { name: GlyphName; size?: number }) {
  const paths: Record<GlyphName, ReactNode> = {
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8m-8 4h8"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15m6-12v15"/></>,
    pin: <><path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    church: <><path d="M12 2v5M9.5 4.5h5M7 21V11l5-4 5 4v10M3 21v-7l4-2m10 0 4 2v7H3m7 0v-4a2 2 0 1 1 4 0v4"/></>,
    minus: <path d="M5 12h14"/>,
    expand: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>,
    target: <><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>,
    ticket: <><path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Z"/><path d="M15 7.5v1m0 3v1m0 3v1"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2"/></>,
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
    roster: <><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1m-7 6 1.2 1.2L11 9m2 2h3m-8 5 1.2 1.2L11 15m2 2h3"/></>,
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
    camera: <><path d="M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.5"/></>,
    birthday: <><path d="M4 20h16M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M5 15c1.5 0 1.8 1 3.5 1s2-1 3.5-1 2 1 3.5 1 2-1 3.5-1M12 12V8m0-2c1.3-.9.8-2.6 0-3.5-.8.9-1.3 2.6 0 3.5Z"/></>,
    month: <><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h2m3 0h2m3 0h1M7 17h2m3 0h2"/></>,
    whatsapp: <><path d="M20.9 11.7a8.9 8.9 0 0 1-13 8l-4.7 1.2 1.3-4.5a8.9 8.9 0 1 1 16.4-4.7Z"/><path d="M9 8.2c-.6-.1-.9.4-.9 1.1 0 2.4 3 5.4 5.5 5.6.7 0 1.4-.4 1.5-1.1l-1.8-1.1-.8.7a5.3 5.3 0 0 1-2.4-2.4l.6-.8-.9-1.9Z"/></>,
    logout: <><path d="M10 7V5H4v14h6v-2"/><path d="M10 12h10m-3-3 3 3-3 3"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">{paths[name]}</svg>;
}
