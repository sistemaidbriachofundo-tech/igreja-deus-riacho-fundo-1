import assert from "node:assert/strict";
import { mercadoPagoManifest, signMercadoPagoManifest, verifyMercadoPagoWebhook } from "./mercado-pago-signature";

it("constrói o manifesto oficial e só aceita assinaturas válidas", () => {
  const manifest = mercadoPagoManifest({ dataId: "pay-1", requestId: "req-1", ts: "1700000000" });
  assert.equal(manifest, "id:pay-1;request-id:req-1;ts:1700000000;");
  const v1 = signMercadoPagoManifest("segredo-de-teste", manifest);
  const header = `ts=1700000000,v1=${v1}`;
  assert.equal(verifyMercadoPagoWebhook({ secret: "segredo-de-teste", signatureHeader: header, requestId: "req-1", dataId: "pay-1" }), true);
  assert.equal(verifyMercadoPagoWebhook({ secret: "outro", signatureHeader: header, requestId: "req-1", dataId: "pay-1" }), false);
});
