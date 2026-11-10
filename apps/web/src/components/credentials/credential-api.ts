import { ApiRequestError, apiGet, apiPost, getApiBaseUrl } from "../../lib/api";
import type { CredentialCard, QrCheck } from "./credential-model";
import { interpretQr } from "./credential-model";

export function openCredential(token: string, credentialId: string): Promise<CredentialCard> {
  return apiGet<CredentialCard>(`/credentials/${encodeURIComponent(credentialId)}`, token);
}

export function openCredentialByMembership(token: string, membershipId: string): Promise<CredentialCard> {
  return apiGet<CredentialCard>(
    `/credentials/by-membership/${encodeURIComponent(membershipId)}`,
    token,
  );
}

export function issueCredential(token: string, membershipId: string): Promise<CredentialCard> {
  return apiPost<CredentialCard>(`/credentials/issue/${encodeURIComponent(membershipId)}`, token);
}

export function revokeCredential(token: string, credentialId: string): Promise<CredentialCard> {
  return apiPost<CredentialCard>(`/credentials/revoke/${encodeURIComponent(credentialId)}`, token);
}

export async function verifyCredentialQr(qrPayload: string): Promise<QrCheck> {
  const data = await apiGet<{ status: string; valid?: boolean }>(
    `/credentials/verify/${encodeURIComponent(qrPayload)}`,
    "",
  );
  return interpretQr(data.status, data.valid);
}

/** Gera o PDF na API e só então baixa os bytes. Falha de storage permanece erro. */
export async function downloadCredentialPdf(token: string, credentialId: string): Promise<number> {
  await apiPost(`/credentials/${encodeURIComponent(credentialId)}/pdf`, token);
  const response = await fetch(
    `${getApiBaseUrl()}/credentials/${encodeURIComponent(credentialId)}/pdf`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/pdf",
      },
      cache: "no-store",
      credentials: "omit",
    },
  );
  if (!response.ok) {
    const kind = response.status === 401
      ? "unauthorized"
      : response.status === 403
        ? "forbidden"
        : "http";
    throw new ApiRequestError(`PDF falhou (${response.status})`, response.status, kind);
  }
  const blob = await response.blob();
  if (typeof document === "undefined") return response.status;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "carteirinha.pdf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return response.status;
}
