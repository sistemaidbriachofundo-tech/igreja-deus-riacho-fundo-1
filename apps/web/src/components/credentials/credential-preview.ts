import type { CredentialCard } from "./credential-model";

/** Token opaco fictício, só para desenhar o QR na pré-visualização de desenvolvimento. */
const PREVIEW_TOKEN = "Q3JlZGVuY2lhbFByZXZpZXdUb2tlblNlbVBJSVllcw";

const previewQrSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"180\" height=\"180\" viewBox=\"0 0 29 29\" shape-rendering=\"crispEdges\"><path fill=\"#ffffff\" d=\"M0 0h29v29H0z\"/><path stroke=\"#000000\" d=\"M0 0.5h7m2 0h4m1 0h3m1 0h3m1 0h7M0 1.5h1m5 0h1m2 0h2m2 0h1m1 0h1m6 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m1 0h5m1 0h1m3 0h1m3 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m1 0h3m3 0h1m4 0h2m1 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m1 0h2m1 0h1m2 0h3m3 0h1m1 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m1 0h3m2 0h3m6 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M8 7.5h1m1 0h3m6 0h1M0 8.5h1m1 0h5m2 0h2m1 0h4m1 0h1m1 0h2m1 0h5M0 9.5h2m1 0h1m3 0h1m1 0h5m1 0h2m1 0h1m1 0h9M1 10.5h4m1 0h2m1 0h1m1 0h2m1 0h2m1 0h2m2 0h1m2 0h1M0 11.5h2m1 0h2m5 0h3m3 0h1m1 0h1m2 0h2m2 0h1m1 0h2M0 12.5h2m2 0h1m1 0h1m1 0h4m1 0h6m1 0h1m4 0h1m1 0h2M2 13.5h1m1 0h1m2 0h4m2 0h1m1 0h2m2 0h3m1 0h2m1 0h2M0 14.5h2m3 0h2m4 0h2m1 0h2m1 0h2m5 0h1m1 0h1M0 15.5h2m1 0h2m2 0h2m1 0h2m6 0h2m1 0h3m1 0h1m2 0h1M0 16.5h2m2 0h1m1 0h1m4 0h5m1 0h1m1 0h2m6 0h1M0 17.5h1m1 0h1m2 0h1m1 0h1m3 0h1m4 0h1m3 0h2m1 0h3m2 0h1M0 18.5h1m2 0h1m2 0h5m1 0h2m1 0h1m5 0h1m3 0h3M0 19.5h1m1 0h1m2 0h1m2 0h1m2 0h2m1 0h3m1 0h1m2 0h2m1 0h2M0 20.5h1m2 0h2m1 0h2m2 0h1m2 0h2m2 0h1m1 0h7m1 0h1M8 21.5h2m2 0h1m1 0h1m1 0h5m3 0h2M0 22.5h7m4 0h1m1 0h3m4 0h1m1 0h1m1 0h1m1 0h1M0 23.5h1m5 0h1m1 0h2m1 0h2m1 0h1m1 0h1m1 0h3m3 0h2m1 0h2M0 24.5h1m1 0h3m1 0h1m1 0h2m1 0h2m4 0h1m2 0h9M0 25.5h1m1 0h3m1 0h1m1 0h2m2 0h2m1 0h2m1 0h1m1 0h1m2 0h1m1 0h1m1 0h2M0 26.5h1m1 0h3m1 0h1m1 0h1m2 0h5m1 0h2m1 0h1m1 0h1m1 0h2m1 0h1M0 27.5h1m5 0h1m3 0h3m1 0h3m1 0h2m1 0h5m1 0h1M0 28.5h7m1 0h1m3 0h1m1 0h1m2 0h1m1 0h1m5 0h1\"/></svg>\n";

function card(overrides: Partial<CredentialCard>): CredentialCard {
  return {
    id: "cred-preview-joao",
    status: "ACTIVE",
    displayName: "João Silva",
    churchName: "Igreja de Deus no Riacho Fundo I",
    qrPayload: PREVIEW_TOKEN,
    issuedAt: "2026-11-04T12:00:00.000Z",
    revokedAt: null,
    personId: "person-preview-joao",
    membershipId: "cm4h8k2n9q7a",
    ministryName: "Homens",
    qrSvg: previewQrSvg,
    pdf: { hasFile: false, contentType: null, byteSize: null, generatedAt: null },
    ...overrides,
  };
}

export const activePreviewCard = card({});

export const revokedPreviewCard = card({
  id: "cred-preview-maria",
  status: "REVOKED",
  displayName: "Maria Oliveira",
  personId: "person-preview-maria",
  membershipId: "cm4h8k2n9q7b",
  ministryName: null,
  revokedAt: "2026-11-08T15:00:00.000Z",
});
