# Contrato API mobile — F6 (núcleo BE)

**Contrato:** OpenAPI `packages/shared/openapi/f2-v0.2.yaml` · `API_CONTRACT_VERSION = "0.6.0-f6"`  
**Escopo:** backend only — **sem** app React Native/Expo neste PR.  
**Produto default:** Riacho Fundo I (`riacho-fundo-1`). Multi-igreja via grants + switch.

> Clientes mobile (futuro Expo) devem consumir estes endpoints. Web Next permanece single-church RF1 até o FE optar pelo switcher.

## Auth claims (JWT)

Login / refresh / switch-church devolvem o mesmo envelope `LoginResponse`:

```json
{
  "accessToken": "…",
  "tokenType": "Bearer",
  "expiresInSeconds": 3600,
  "user": {
    "userId": "…",
    "personId": "…",
    "email": "…",
    "organizationId": "…",
    "churchId": "…",
    "grants": [
      { "roleCode": "SECRETARIA", "organizationId": "…", "churchId": "…" }
    ]
  }
}
```

Claims no access token: `sub`, `personId`, `email`, `grants`, `organizationId`, `churchId`, `iat`, `exp`.

| Método | Path | Auth | Notas |
|--------|------|------|--------|
| POST | `/auth/login` | público | Default `churchId` = RF1 se grant cobrir |
| GET | `/auth/me` | Bearer | Espelha claims do token |
| POST | `/auth/refresh` | Bearer | Relê grants no DB; preserva church ativa se ainda coberta |
| POST | `/auth/switch-church` | Bearer | Body `{ "churchId" }` — 403 sem grant |

Não há refresh token opaco neste núcleo: o cliente reusa o access JWT (curto) em `POST /auth/refresh`.

## Congregações

| Método | Path | Auth | Notas |
|--------|------|------|--------|
| GET | `/churches` | Bearer | Só churches cobertas pelos grants; `defaultChurchId` = RF1 |

`PLATFORM_ADMIN` org-wide (`churchId` null no grant) vê todas as congregações da org.

## Auditoria cross-church

| Método | Path | Papéis | Notas |
|--------|------|--------|--------|
| GET | `/audit-logs` | SECRETARIA, PASTOR, PLATFORM_ADMIN | Default = church ativa / RF1 |
| GET | `/audit-logs?churchId=` | idem | Filtra uma church (grant obrigatório) |
| GET | `/audit-logs?scope=organization` | **PLATFORM_ADMIN** | Cross-church na org |

## Indicadores (stubs de leitura)

Respostas incluem `"stub": true` até dashboards F6 maduros. Contagens são reais mínimas.

| Método | Path | Auth | Notas |
|--------|------|------|--------|
| GET | `/indicators/summary` | Bearer | Opcional `churchId`, `scope=organization` (admin) |
| GET | `/indicators/membership` | Bearer | `byStatus` por congregação |

## Transferências

Já existiam (F3): `GET/POST /transfers`, advance. Mesmo `person_id` entre congregações da org — sem duplicar pessoa.

## Seed demo F6

| Email | Senha | Papel / escopo |
|-------|-------|----------------|
| `ana.demo@example.test` | `admin` | SECRETARIA em RF1 **e** RF2 demo |
| `platform.demo@example.test` | `admin` | PLATFORM_ADMIN org-wide |
| `bruno.demo@example.test` | `admin` | MEMBRO RF1 |
| `pastor.demo@example.test` | `admin` | PASTOR RF1 |

Segunda congregação seed: slug `riacho-fundo-2-demo` (id fixo `demoChurchDest02`).

## Fluxo mobile sugerido

1. `POST /auth/login` → guardar `accessToken` + `user.churchId`
2. `GET /churches` → UI switcher (se `churches.length > 1`)
3. `POST /auth/switch-church` `{ churchId }` → substituir token
4. Chamadas de domínio com Bearer; escopo = claims ativos
5. Antes do `exp`, `POST /auth/refresh`
6. Indicadores: `GET /indicators/summary` (ou `scope=organization` para admin)

## Fora deste núcleo

- App React Native / Expo
- Push notifications / deep links
- OIDC/MFA live
- UI web multi-igreja
- Patrimônio / HA / dashboards avançados (roadmap F6 restante)
