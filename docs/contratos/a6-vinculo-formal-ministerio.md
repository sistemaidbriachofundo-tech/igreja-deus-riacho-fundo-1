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

**BLOCKED nesta entrega (frente B / #127, base `ca00a4fd`).** O adaptador consulta `to_regclass('public.ministry_memberships')`. Com resultado nulo — o estado do schema atual — a API permanece 501. A migration e o model Prisma ficam com o integrador #133. Este contrato não altera `schema.prisma`, `packages/db/prisma/migrations` nem `packages/shared`.

SQL proposto, ainda não aplicado:

```sql
CREATE TABLE ministry_memberships (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  church_id text NOT NULL,
  ministry_id text NOT NULL,
  person_id text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  source text NOT NULL,
  volunteer_interest_id text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ministry_memberships_ministry_fkey
    FOREIGN KEY (ministry_id) REFERENCES ministries (id),
  CONSTRAINT ministry_memberships_person_fkey
    FOREIGN KEY (person_id) REFERENCES persons (id),
  CONSTRAINT ministry_memberships_role_chk
    CHECK (role IN ('LIDER', 'COORDENADOR', 'INTEGRANTE', 'APOIO')),
  CONSTRAINT ministry_memberships_status_chk
    CHECK (status IN ('ATIVO', 'CONVIDADO', 'PAUSADO', 'ENCERRADO')),
  CONSTRAINT ministry_memberships_source_chk
    CHECK (source IN ('DIRETO', 'CONVERSAO_INTERESSE'))
);
CREATE UNIQUE INDEX ministry_memberships_ministry_person_key
  ON ministry_memberships (ministry_id, person_id);
CREATE INDEX ministry_memberships_person_idx ON ministry_memberships (person_id);
CREATE INDEX ministry_memberships_scope_idx
  ON ministry_memberships (organization_id, church_id, ministry_id);
```

O `id` do ministério já é único. A aplicação ainda exige `organization_id`, `church_id` e `ministry_id` juntos em toda leitura e escrita, para o líder não atravessar congregação nem ministério.

Quando `to_regclass` devolver a tabela, o 501 do vínculo formal sai de cena:

| Método | Rota | Sem tabela | Com tabela e escopo autorizado |
|---|---|---|---|
| GET | `/ministry-scope/:ministryId/formal-memberships` | 501 `members: null` | 200 `blocked: false`, `members` |
| POST | `/ministry-scope/:ministryId/formal-memberships` | 501 `createdMembership: null` | 201 integrante `{ personId, role }` |
| POST | `/ministry-scope/:ministryId/formal-memberships/from-interest` | 501 `createdMembership: null` | 201 só se o interesse é daquele ministério e tem `personId` |
| POST | `/ministry-scope/:ministryId/formal-memberships/:membershipId/end` | 501 `member: null` | 200 `status: ENCERRADO` |
| GET | `/ministry-scope/:ministryId/agenda` | 501 `items: null` + `scheduleText` | continua 501: não há modelo de agenda |
| GET | `/ministry-scope/:ministryId/requests` | 501 `requests: null` | continua 501: não há modelo de solicitação |

Papel `LIDER` no vínculo é função da equipe. Não cria `Grant` e não torna a pessoa líder de acesso.
A mesma pessoa pode estar em mais de um ministério. Dois vínculos abertos no mesmo ministério respondem 409.
Encerrar por um `ministryId` que não é o dono do vínculo responde 404 e não altera a linha.
Conversão não muda `VolunteerInterest.stage`. Interesse sem `personId`, ou pessoa de outra organização/igreja, não cria pessoa nem integrante.
Auditoria em `audit_logs`: `ministry_membership.admit`, `ministry_membership.convert_interest`, `ministry_membership.reactivate`, `ministry_membership.end`. Metadata só traz `ministryId`, `personId`, `role`, `status`, `previousStatus`, `source`, `volunteerInterestId`.

Fora do ministério autorizado, qualquer uma delas responde **403** `MINISTRY_SCOPE_FORBIDDEN` antes do 501.
Ministério inexistente na congregação piloto: **404**.

Papéis da rota: `SECRETARIA`, `PASTOR`, `LIDER_MINISTERIO`, `PLATFORM_ADMIN`.
`MEMBRO` e `TESOURARIA` recebem 403 de papel. Tesouraria não herda a equipe do ministério.

Conversão controlada: `POST` com `{ "volunteerInterestId": "..." }`.
A aplicação só grava se o interesse pertence àquele `ministryId` e já tem `personId` na mesma organização e igreja.
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

## Agenda e solicitações

Continuam **BLOCKED**. O horário livre já gravado em `Ministry.scheduleText` pode ser exibido. Itens estruturados e filas de solicitação não são inventados. Escalas globais (`/rosters`) permanecem fora desta frente.

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
