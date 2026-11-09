# SEC/P1 — contrato de edição cadastral da Secretaria

Issue #111. Este documento é o contrato para a issue #91 consumir. Não altera `packages/shared`: o tipo `PatchPersonRequest` de lá continua só com `isMinor`, `legalGuardianPersonId` e `householdId` até o agente integrador publicar a versão nova.

Autorização reutiliza `canManageMemberships` já existente. Quem não tem grant de `SECRETARIA` na congregação piloto, ou grant de `PLATFORM_ADMIN` que cubra essa congregação, recebe 403. Este PR não cria papel novo e não libera admin técnico sem grant. Pastor, tesouraria, líder e membro não gravam ficha por aqui.

`expectedUpdatedAt` é o `updatedAt` devolvido pela API, em ISO-8601. Se divergir, ou se outra gravação vencer a condição `updatedAt` no `updateMany`, a resposta é 409.

## Pessoa — `PATCH /persons/:id`

Atributos da pessoa. Não grava situação do vínculo, observação do vínculo, tipo eclesiástico nem login.

| Campo | Efeito |
|---|---|
| `displayName` | Texto de 2 a 160 caracteres, espaços colapsados. Homônimo normalizado de outra pessoa na mesma organização não bloqueia; a resposta traz `dedupeAlerts` e a auditoria lista `dedupeAlertPersonIds`. |
| `email` | Contato, não credencial. Minúsculas. `null` limpa. Formato inválido: 400 `PERSON_EMAIL_INVALID`. Outra pessoa da mesma organização com o mesmo e-mail: 409 `PERSON_EMAIL_DUPLICATE`. Não altera `User.email`. |
| `isMinor`, `legalGuardianPersonId`, `householdId` | Regras já existentes. Menor sem responsável: 400. Responsável precisa ser adulto da organização e não pode ser a própria pessoa. Família precisa existir na congregação piloto. Ciclo de responsável: 400 `PERSON_GUARDIAN_CYCLE`. Pessoa com dependentes marcada como menor: 400 `PERSON_HAS_DEPENDENTS`. |
| `expectedUpdatedAt` | Opcional. Divergência: 409 `PERSON_VERSION_CONFLICT`. |
| `status` | 400 `PERSON_STATUS_REGULATED`. Coluna existe; não há fluxo de inativação. |
| `kind` | 400 `PERSON_KIND_REGULATED`. `MEMBER` só nasce na aprovação pastoral da admissão. |
| `phone`, `address` e qualquer outro campo | 400 do pipe (`forbidNonWhitelisted`). O service também recusa `phone`, `mobilePhone` e `address` com `PERSON_CONTACT_UNSUPPORTED`. |

Resposta: o resumo já devolvido por `GET /persons/:id`, mais `legalGuardianPersonId`, `updatedAt` e `dedupeAlerts` (array, vazio quando não há homônimo). `GET /persons/:id` e o dossiê passam a incluir `updatedAt` quando o banco devolve a data. O dossiê também inclui `updatedAt` em cada vínculo.

Auditoria: `audit_logs.action = person.patch`, com `fields`, `before` e `after` só dos campos alterados.

## Vínculo — `PATCH /memberships/:membershipId`

Atributos do vínculo. Não grava nome, e-mail nem família.

| Campo | Efeito |
|---|---|
| `notes` | Até 4000 caracteres. Branco vira `null`. Texto igual ao atual não gera escrita nem auditoria. |
| `expectedUpdatedAt` | Opcional. Divergência ou corrida: 409 `MEMBERSHIP_VERSION_CONFLICT`. |
| `status` | 400 `MEMBERSHIP_STATUS_REGULATED`. Não grava. |
| `leftAt`, `displayName`, `email` | 400 do pipe. `leftAt` no service, se chegar, é `MEMBERSHIP_LEFT_AT_REGULATED`. |

A situação continua nos fluxos que já existem:

- `PENDING_ADMISSION` → `ACTIVE`: aprovação pastoral em `/admissions`.
- `ACTIVE` → `TRANSFERRED` e `leftAt`: `/transfers`.
- `INACTIVE`: sem fluxo regulado. Não é aceito neste PATCH.

Resposta: `id`, `personId`, `churchId`, `organizationId`, `status` (inalterado), `joinedAt`, `leftAt`, `notes`, `updatedAt`.

Auditoria: `membership.notes.patch`, com `before.notes`, `after.notes` e o `status` apenas como leitura.

Papéis do controller: os mesmos de `POST /memberships` (`SECRETARIA`, `PLATFORM_ADMIN`). O service exige o grant no piloto.

## Matriz

| Caso | Resultado |
|---|---|
| Nome e e-mail de contato, com auditoria e escopo da organização | PASS |
| E-mail inválido e e-mail duplicado na organização | PASS |
| Homônimo de nome sem bloquear a gravação | PASS |
| Menor, responsável, ciclo, dependente e família de outra congregação | PASS |
| 409 por `expectedUpdatedAt` ou por corrida no `updatedAt` | PASS |
| 403 sem grant, pastor, tesouraria, outra congregação e platform admin de outra igreja | PASS |
| Platform admin com grant nesta congregação | PASS, pela função já existente; nenhum grant novo |
| Observação do vínculo, inclusive limpar | PASS |
| Recusa de `status` e `leftAt` do vínculo | PASS na recusa. A alteração em si fica BLOCKED |
| Recusa de `status` e `kind` da pessoa | PASS na recusa. A alteração em si fica BLOCKED |
| Telefone e endereço | BLOCKED. O pedido é recusado. Migração proposta abaixo, sem coluna inventada |
| Histórico em tabela própria de revisão | BLOCKED. A trilha desta entrega é `audit_logs`. Leitura continua em `/audit-logs`, fora deste escopo |
| Publicar o DTO em `@idbrf/shared` | BLOCKED neste PR. Arquivo reservado ao integrador. Contrato está nesta página |
| Unicidade de nome sem acento no PostgreSQL | BLOCKED. O alerta usa o texto já carregado e a comparação do pacote compartilhado. Não há coluna normalizada |
| Sincronizar e-mail da pessoa com o e-mail de login | BLOCKED. Não altera `users` |
| Persistência no PostgreSQL de HML | BLOCKED. Testes usam prisma simulado e dados `*@example.test` |

## Migração proposta — não aplicar neste PR

Só o integrador mexe em `schema.prisma` e em `packages/shared`.

```prisma
enum PersonContactKind {
  PHONE
  ADDRESS
}

model PersonContact {
  id             String            @id @default(cuid())
  personId       String            @map("person_id")
  organizationId String            @map("organization_id")
  kind           PersonContactKind
  value          String
  label          String?
  createdAt      DateTime          @default(now()) @map("created_at")
  updatedAt      DateTime          @updatedAt @map("updated_at")

  @@index([organizationId, personId])
  @@map("person_contacts")
}

model PersonRevision {
  id             String   @id @default(cuid())
  personId       String   @map("person_id")
  organizationId String   @map("organization_id")
  actorUserId    String?  @map("actor_user_id")
  before         Json
  after          Json
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([personId, createdAt])
  @@map("person_revisions")
}
```

`Person.displayNameNorm` também seria necessário para unicidade sem acento no banco. Enquanto essas tabelas não existirem, telefone, endereço e revisão própria permanecem recusados.

Inativação de pessoa e de vínculo precisa de um fluxo com ator, motivo e efeito em credencial. Não entra como coluna solta neste PATCH.
