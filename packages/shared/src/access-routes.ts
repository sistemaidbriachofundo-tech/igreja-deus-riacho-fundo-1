import type { AccessAction, AccessResource } from "./access-policy";

export interface ClassifiedAccess {
  resource: AccessResource;
  action: AccessAction;
  personId?: string;
  ministryId?: string;
}

/** Normaliza path do Express (com ou sem query, com ou sem barra final). */
export function normalizeAccessPath(raw: string): string {
  const noQuery = raw.split("?")[0] ?? raw;
  const withSlash = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) {
    return withSlash.slice(0, -1);
  }
  return withSlash || "/";
}

/**
 * Catálogo das rotas cujo recurso está na matriz A3.
 * Rota ausente fica a cargo do @Roles existente — o guard não inventa allow.
 */
export function classifyAccessRoute(
  method: string,
  rawPath: string,
): ClassifiedAccess | null {
  const verb = method.toUpperCase();
  const path = normalizeAccessPath(rawPath);
  const read = verb === "GET" || verb === "HEAD";

  if (path === "/persons/search" && read) {
    return { resource: "persons", action: "search" };
  }
  if (path === "/persons/candidates" && verb === "POST") {
    return { resource: "persons", action: "search" };
  }

  const dossier = path.match(/^\/persons\/([^/]+)\/dossier$/);
  if (dossier && read) {
    return { resource: "persons", action: "read", personId: dossier[1] };
  }
  const person = path.match(/^\/persons\/([^/]+)$/);
  if (person) {
    if (read) {
      return { resource: "persons", action: "read", personId: person[1] };
    }
    if (verb === "PATCH") {
      return { resource: "persons", action: "write", personId: person[1] };
    }
  }

  if (path === "/pastoral-cases" || path.startsWith("/pastoral-cases/")) {
    return { resource: "pastoral", action: read ? "read" : "write" };
  }

  if (path === "/admin/access" || path.startsWith("/admin/access/")) {
    return { resource: "admin", action: "administer" };
  }

  if (path === "/ledger" || path.startsWith("/ledger/")) {
    return { resource: "ledger", action: read ? "read" : "write" };
  }

  if (path === "/ministries" && verb === "POST") {
    return { resource: "ministries", action: "administer" };
  }
  if (path === "/ministries" && read) {
    return { resource: "ministries", action: "read" };
  }
  const ministry = path.match(/^\/ministries\/([^/]+)$/);
  if (ministry) {
    return {
      resource: "ministries",
      action: read ? "read" : "write",
      ministryId: ministry[1],
    };
  }
  const ministryNested = path.match(/^\/ministries\/([^/]+)\/.+$/);
  if (ministryNested) {
    return {
      resource: "ministries",
      action: "write",
      ministryId: ministryNested[1],
    };
  }

  if (path === "/rosters" || path.startsWith("/rosters/")) {
    return { resource: "ministries", action: read ? "read" : "write" };
  }
  if (path === "/slots" || path.startsWith("/slots/")) {
    return { resource: "ministries", action: "write" };
  }

  const confirm = path.match(/^\/assignments\/([^/]+)\/(?:confirm|decline)$/);
  if (confirm && verb === "POST") {
    return { resource: "ministries", action: "respond" };
  }
  if (path === "/assignments" || path.startsWith("/assignments/")) {
    return { resource: "ministries", action: "write" };
  }
  if (
    path === "/volunteer-availabilities" ||
    path.startsWith("/volunteer-availabilities/") ||
    path === "/volunteer-impediments" ||
    path.startsWith("/volunteer-impediments/") ||
    path === "/roster-couple-exceptions" ||
    path.startsWith("/roster-couple-exceptions/")
  ) {
    return { resource: "ministries", action: read ? "read" : "write" };
  }

  if (path === "/cms/site-layout/publish" && verb === "POST") {
    return { resource: "cms", action: "publish" };
  }
  if (path === "/cms/site-layout" && read) {
    return { resource: "cms", action: "read" };
  }
  if (path === "/cms/site-layout/draft" || path.startsWith("/cms/site-layout/restore/")) {
    return { resource: "cms", action: "write" };
  }
  if (path === "/cms/site-media" || path.startsWith("/cms/site-media/")) {
    return { resource: "cms", action: read ? "read" : "write" };
  }
  if (path === "/cms/contents" || path.startsWith("/cms/contents/")) {
    return { resource: "cms", action: read ? "read" : "write" };
  }

  if (path === "/auth/oidc/config") {
    return { resource: "admin", action: "administer" };
  }

  if (path === "/audit-logs" || path.startsWith("/audit-logs/")) {
    return { resource: "audit", action: read ? "read" : "write" };
  }

  return null;
}
