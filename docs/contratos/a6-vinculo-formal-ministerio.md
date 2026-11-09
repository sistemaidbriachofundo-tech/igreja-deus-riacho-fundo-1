# A6 — Vínculo formal de pessoa ao ministério

Issue #97. Frente isolada. Este documento é proposta de contrato.
Não altera `schema.prisma`, migrations, `packages/shared`, login, Secretaria nem o ledger.

## Distinção

`VolunteerInterest` (tabela `volunteer_interests`, rotas `/volunteer-interests`) é manifestação de interesse.
Etapa `EQUIPE`, `DISPONIBILIDADE` ou `ESCALA` não cria integrante.

Uma pessoa pode ter vínculo formal com vários ministérios.
O líder dos Homens só enxerga Homens. Dado de outro ministério responde **403**.
Contato, documento, nota interna e dado pastoral não entram no catálogo de integrantes.

## O que já existe e pode ser lido

- `GET /ministries` — lista já filtrada por `canManageSpecificMinistry`.
- `GET /volunteer-interests?ministryId=` — interesses do ministério autorizado.
  A tela nova mostra esses registros em coluna própria e remove e-mail, telefone e nota interna da projeção.
- `Ministry.scheduleText` — horário livre já gravado no perfil. Não é agenda estruturada.
- `canManageSpecificMinistry` em `@idbrf/shared` — reutilizado. A matriz da issue #92 não é editada aqui.

## BLOCKED — integrador (schema)

Não há modelo de integrante. Proposta, ainda sem migration:

```prisma
model MinistryMembership {
  id                  String   @id @default(cuid())
  organizationId      String
  churchId            String
  ministryId          String
  personId            String
  role                String   // LIDER | COORDENADOR | INTEGRANTE | APOIO
  status              String   // ATIVO | CONVIDADO | PAUSADO | ENCERRADO
  source              String   // DIRETO | CONVERSAO_INTERESSE
  volunteerInterestId String?
  startedAt           DateTime
  endedAt             DateTime?
  @@unique([ministryId, personId])
  @@index([personId])
}
```

Sem `@@unique([personId])`: a mesma pessoa pode participar de mais de um ministério.

Também faltam modelos de agenda estruturada e de solicitação do ministério.
`GET /rosters` não é reutilizado: a listagem atual não restringe o líder ao próprio ministério e pertence à frente de escalas (#98).

Enquanto a tabela não existir, as rotas abaixo conferem o escopo e respondem **501** com `blocked: true` e coleção `null`.
Não gravam pessoa, não avançam interesse e não inventam integrante.

| Método | Rota | Código quando autorizado | Corpo |
|---|---|---|---|
| GET | `/ministry-scope/:ministryId/formal-memberships` | `MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED` | `members: null` |
| POST | `/ministry-scope/:ministryId/formal-memberships/from-interest` | `MINISTRY_INTEREST_CONVERSION_BLOCKED` | `createdMembership: null` |
| GET | `/ministry-scope/:ministryId/agenda` | `MINISTRY_AGENDA_MODEL_BLOCKED` | `items: null`, mais `scheduleText` do perfil |
| GET | `/ministry-scope/:ministryId/requests` | `MINISTRY_REQUEST_MODEL_BLOCKED` | `requests: null` |

Fora do ministério autorizado, qualquer uma delas responde **403** `MINISTRY_SCOPE_FORBIDDEN` antes do 501.
Ministério inexistente na congregação piloto: **404**.

Papéis da rota: `SECRETARIA`, `PASTOR`, `LIDER_MINISTERIO`, `PLATFORM_ADMIN`.
`MEMBRO` e `TESOURARIA` recebem 403 de papel. Tesouraria não herda a equipe do ministério.

Conversão controlada: `POST` com `{ "volunteerInterestId": "..." }`.
O integrador, ao persistir, precisa confirmar que o interesse é daquele `ministryId` e criar o vínculo numa transação explícita.
Avançar a etapa do interesse continua sendo outro endpoint e não dispara esta conversão.

Quando o 200 existir, o corpo aceito é:

```json
{
  "blocked": false,
  "members": [
    {
      "id": "mmb_sintetico",
      "personId": "per_sintetico",
      "displayName": "Pessoa Sintética",
      "role": "INTEGRANTE",
      "status": "ATIVO"
    }
  ]
}
```

Payload com `stage` de voluntariado e sem `role` é recusado pela interface. Nenhum nome é promovido por semelhança.

## BLOCKED — finanças #96

`CostCenter` não referencia `ministryId`. Não há contrato de saldo por ministério.

`GET /ministry-scope/:ministryId/cost-center-balance`

- 403 fora do escopo
- 501 `MINISTRY_FINANCE_CONTRACT_BLOCKED` com `balance: null` dentro do escopo

Esta rota não lê e não grava ledger. A interface mantém o saldo oculto mesmo se uma resposta futura trouxer número, até o contrato da #96 ser aceito (`MINISTRY_FINANCE_CONTRACT_APPROVED = false`).

## Fora desta entrega

- Secretaria / `HmlPhaseOne` (#91)
- Login, `AppShell`, `AdminAccessGate` (#103)
- `packages/shared` e a matriz RBAC (#101 / #92)
- `schema.prisma` e migrations
- Módulos `apps/api/src/finance` (#96)
- Escalas e espaço do membro (#98)
