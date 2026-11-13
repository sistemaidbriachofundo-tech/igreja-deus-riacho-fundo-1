import { publicApiBase } from "./portal-live-data";

export const PRODUCTION_API_ORIGIN = "https://api.igrejadeusrf1.com.br";

export function isProductionAdmin(): boolean {
  return process.env.NEXT_PUBLIC_ADMIN_PRODUCTION === "true";
}

export function isAdminEnabled(): boolean {
  if (isProductionAdmin()) {
    return publicApiBase(process.env.NEXT_PUBLIC_API_URL) === PRODUCTION_API_ORIGIN;
  }
  return process.env.NEXT_PUBLIC_HML_ENABLED === "true";
}
