# Handoff F5 — Canais (WhatsApp / e-mail / push)

**Branch:** `cursor/das-f5-channels`  
**Contrato:** `API_CONTRACT_VERSION = "0.6.0-channels"` · OpenAPI `packages/shared/openapi/f2-v0.2.yaml`  
**Escopo:** Backend only · **sem** WABA/SMTP/FCM live · **sem** IA · draft PR, sem merge  
**CMS:** #38 já em `main` — só stub opcional `notifyOnPublish`

## O que entregou

| Área | Detalhe |
|---|---|
| Prisma | `MessageTemplate`, `CommunicationConsent`, `CommunicationOutbox`, `OutboxDeliveryEvent` + enums `CommChannel` / `OutboxStatus` |
| Providers | Interface `ChannelProvider` + adapters **mock** / **noop** (env) |
| Admin APIs | Templates, consents, outbox enqueue/list/get/dispatch, rate-limits, providers |
| Rate limits | In-memory por canal/igreja (`CHANNELS_*_RATE_MAX`) |
| CMS stub | `notifyOnPublish` / `notifyChannels` em patch/advance → outbox `sourceType=cms_content` |
| Testes | `channels.service.spec`, rate-limit, providers.factory, wiring, shared contracts |
| OpenAPI | Tag `channels` + campos notify no CMS advance |

## Endpoints (admin: SECRETARIA / PASTOR / PLATFORM_ADMIN)

- `GET /channels/providers`
- `GET /channels/rate-limits`
- `GET|POST /channels/templates` · `PATCH /channels/templates/:templateId`
- `GET|PUT /channels/consents/:personId`
- `GET|POST /channels/outbox`
- `GET /channels/outbox/:outboxId`
- `POST /channels/outbox/:outboxId/dispatch`
- `POST /channels/outbox/dispatch-pending`

CMS (opcional na publicação):

```json
{
  "toStatus": "PUBLICADO",
  "notifyOnPublish": true,
  "notifyChannels": ["EMAIL"],
  "notifyToAddress": "secretaria@example.invalid"
}
```

## Env (documentado em `.env.example`)

```bash
CHANNELS_PROVIDER=noop          # fallback
WHATSAPP_PROVIDER=noop|mock
EMAIL_PROVIDER=noop|mock
PUSH_PROVIDER=noop|mock
CHANNELS_WHATSAPP_RATE_MAX=20
CHANNELS_EMAIL_RATE_MAX=60
CHANNELS_PUSH_RATE_MAX=120
# Live (NÃO usados nesta fatia): WHATSAPP_ACCESS_TOKEN, SMTP_*, FCM_SERVER_KEY, …
```

## Fluxo outbox

1. Consentimento opt-in por canal (se `personId` e sem `skipConsentCheck`)
2. Enfileira `PENDING` (+ `OutboxDeliveryEvent`)
3. `dispatch` → rate limit → provider mock/noop → `SENT` / `DELIVERED` / `FAILED` / `DEAD`
4. CMS publish com `notifyOnPublish` enfileira stub (soft-fail; não bloqueia publicação)

## Fora de escopo (explícito)

- WhatsApp Cloud API / webhook assinado / templates Meta live  
- SMTP Hostinger / FCM / APNs  
- Worker Redis/BullMQ (dispatch é admin sync)  
- IA / RAG / `ai_requests`  
- FE Church OS telas de canais  

## FE / próximo passo

- Descoberta: `GET /meta` → `contractVersion: 0.6.0-channels` + mapa `endpoints`  
- UI admin canais: listar outbox/status, toggles de consentimento, templates  
- Habilitar live só após PEN WABA/SMTP e troca de adapters (manter interface)
