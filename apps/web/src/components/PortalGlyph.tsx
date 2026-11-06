import type { SVGProps } from "react";

export type PortalGlyphName =
  | "calendar" | "arrow" | "chevron" | "users" | "heart" | "shield"
  | "sparkle" | "hands" | "flame" | "menu" | "close" | "down" | "home";
export function PortalGlyph({ name, ...rest }: SVGProps<SVGSVGElement> & { name: PortalGlyphName }) {
  const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, "aria-hidden": true as const, ...rest };
  switch (name) {
    case "calendar":
      return <svg {...base}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg>;
    case "users":
      return <svg {...base}><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 11a4 4 0 0 0-1-7m1 11a5 5 0 0 1 4 5"/></svg>;
    case "heart":
      return <svg {...base}><path d="M20.3 5.8a5 5 0 0 0-7.1 0L12 7l-1.2-1.2a5 5 0 0 0-7.1 7.1L12 21l8.3-8.1a5 5 0 0 0 0-7.1Z"/></svg>;
    case "shield":
      return <svg {...base}><path d="m12 2 9 4v6c0 5-3.7 8.7-9 10-5.3-1.3-9-5-9-10V6l9-4Z"/><path d="m9 12 2 2 4-4"/></svg>;
    case "hands":
      return <svg {...base}><path d="M7 14 3 10l-1 2 5 7h4l2-2m4-3 4-4 1 2-5 7h-4l-2-2"/><path d="m8 11 3-3 2 2m3 1-3-3-2 2"/></svg>;
    case "sparkle":
      return <svg {...base}><path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z"/></svg>;
    case "flame":
      return <svg {...base}><path d="M12 22c5 0 8-3.8 8-8.2 0-4.1-2.6-6.8-4.2-8.6.1 3.6-2 4-3 4.1C13 5.5 10.4 3.6 8 2c.4 5.3-4 7.4-4 12 0 4.4 3 8 8 8Z"/><path d="M12 21c2.3 0 3.7-1.8 3.7-4 0-1.8-1.4-3.3-2.4-4.5.2 2-2.1 2.7-3.2 4.1-.9 1.2-1 2-.8 2.6A2.7 2.7 0 0 0 12 21Z"/></svg>;
    case "home":
      return <svg {...base}><path d="m3 11 9-8 9 8v9H3z"/><path d="M9 20v-7h6v7"/></svg>;
    case "arrow":
      return <svg {...base}><path d="M5 12h14m-6-6 6 6-6 6"/></svg>;
    case "chevron":
      return <svg {...base}><path d="m6 9 6 6 6-6"/></svg>;
    case "down":
      return <svg {...base}><path d="M12 4v15m-6-6 6 6 6-6"/></svg>;
    case "menu":
      return <svg {...base}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case "close":
      return <svg {...base}><path d="M5 5l14 14M19 5 5 19"/></svg>;
  }
}
