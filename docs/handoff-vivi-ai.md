# Handoff FE ← BE — Vivi (assistente IA)

**Branch:** `cursor/vivi-ai-gateway-fd01`  
**Contrato:** `API_CONTRACT_VERSION = "0.7.1-vivi"` · OpenAPI `packages/shared/openapi/f2-v0.2.yaml`  
**Escopo:** Backend only (`apps/api`, `packages/shared`, docs) · **sem** redesenho de `apps/web` · draft PR, sem merge/deploy  
**Feature flags:** `API_ENDPOINT_STATUS` em `@idbrf/shared`

| Ambiente | Base URL |
|----------|----------|
| DEV | `http://localhost:3001` |
| HML | **TBD** — `NEXT_PUBLIC_API_URL` quando API HTTPS existir |

Descoberta: `GET /meta` → `contractVersion: 0.7.1-vivi` + `endpoints["POST /public/vivi/chat"]`.

---

## Endpoints

| Método | Path | Auth | Notas |
|--------|------|------|-------|
| GET | `/vivi/status` | público | provider efetivo/modelo (sem chaves), `credentialsReady`, `configWarnings`, avisos LGPD |
| POST | `/public/vivi/chat` | público | **exige** `consentAiProcessing: true`; rate-limit forte |
| POST | `/vivi/chat` | JWT staff | `SECRETARIA` \| `PASTOR` \| `PLATFORM_ADMIN` \| `LIDER_MINISTERIO` |

### Request (público)

```http
POST /public/vivi/chat
Content-Type: application/json

{
  "messages": [{ "role": "user", "content": "Quais ministérios tem no portal?" }],
  "consentAiProcessing": true,
  "sessionId": "fe-anon-uuid"
}
```

Sem `consentAiProcessing: true` → `400` `VIVI_CONSENT_REQUIRED`.

### Response

```json
{
  "reply": "…",
  "provider": "mock",
  "model": "mock-vivi-idbrf",
  "refused": false,
  "lgpdNotice": "Avisos LGPD: …",
  "usage": {
    "inputChars": 40,
    "outputChars": 200,
    "messageCount": 1,
    "latencyMs": 12
  }
}
```

Tipos TS: `ViviChatRequest` / `ViviChatResponse` / `ViviStatusResponse` em `@idbrf/shared`.

---

## Providers (só backend)

| `VIVI_PROVIDER` | Quando | Env |
|-----------------|--------|-----|
| `manus` (preferido) | default se URL+key Manus set | `MANUS_FORGE_URL` + `MANUS_API_KEY` (aliases `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY`) |
| `gemini` | opcional Google AI Studio | `GEMINI_API_KEY` + `GEMINI_MODEL` |
| `mock` | DEV/CI sem credenciais | — |

**Nunca** colocar `GEMINI_API_KEY` / `MANUS_API_KEY` no FE, `NEXT_PUBLIC_*` ou Git.

### Modelo Gemini

- Default: **`gemini-2.5-flash-lite`**
- Nota: ids `gemini-2.5-flash` / `gemini-2.0-flash` podem depreciar; override via `GEMINI_MODEL` para o sucessor listado em https://ai.google.dev/gemini-api/docs/models
- Manus: path OpenAI-compatible `POST {MANUS_FORGE_URL}/v1/chat/completions` (contrato `invokeLLM` da plataforma não é público estável)

### Rate limits

```bash
VIVI_PUBLIC_RATE_MAX=8          # default
VIVI_PUBLIC_RATE_WINDOW_MS=60000
VIVI_ADMIN_RATE_MAX=60
```

Público: bucket por IP + middleware `SimpleRateLimitMiddleware` em `POST /public/vivi/chat`.  
Estouro → `429` `VIVI_RATE_LIMITED`.

---

## LGPD / segurança (FE deve espelhar)

1. Checkbox de consentimento **antes** de enviar (liga `consentAiProcessing`).
2. Mostrar `lgpdNotice` da resposta (ou de `GET /vivi/status`).
3. **Não** enviar dados de membros, CPF, telefone, casos pastorais no prompt.
4. Free tier Google **pode treinar** com prompts — preferir Manus em HML/PRD quando disponível.
5. Heurística BE recusa PII/pastoral (`refused: true`) sem chamar o LLM.

Auditoria opcional (`VIVI_AUDIT=1`): `audit_logs` com contagem/provider/latência — **sem** texto do prompt/reply.

---

## Stub FE sugerido (não implementado neste PR)

- Widget chat no portal: chama só `/public/vivi/chat`.
- Admin opcional: `/vivi/chat` com Bearer.
- Feature flag: `API_ENDPOINT_STATUS["POST /public/vivi/chat"] === "implemented"`.
- UI: consentimento + aviso LGPD; sem input de dados pessoais.

## Fora de escopo

- RAG / embeddings / base doctrinal  
- Streaming SSE  
- Redesign `apps/web`  
- Deploy / merge sem autorização  
- Dados reais de membros  

## Testes BE

- `vivi.service.spec`, `vivi-rate-limit.service.spec`, providers (manus/gemini/factory) com mocks  
- Contrato shared `0.7.1-vivi`
