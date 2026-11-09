# Contrato — Atmosfera, Louvor e Meu Espaço

Frente A7 da issue #87, issue #98. Branch isolada. Não altera `schema.prisma`, migrations, `AppShell`, `LoginScreen` nem `HmlPhaseOne`. Não copia base, token ou serviço do Kairos. Não envia WhatsApp, e-mail ou push.

A regra de negócio reaproveitada é a que já está em `MinistriesService`: confirmação, recusa, substituição e bloqueio de pessoa `PENDING`/`CONFIRMED` no mesmo `serviceAt`.

## Arquivos desta frente

- `apps/web/src/lib/serving-rosters.ts` — leitura estrita e bloqueio de horário
- `apps/web/src/lib/serving-client.ts` — sondagem de `GET /rosters` sem renderizar o corpo
- `apps/web/src/components/serving/*` — telas próprias
- `apps/web/src/app/app/servir/atmosfera/`
- `apps/web/src/app/app/servir/louvor/`
- `apps/web/src/app/app/servir/meu-espaco/`

## O que a API já faz e a tela usa

| Operação | Endpoint | Quem passa no controller atual |
|---|---|---|
| Listar ministérios visíveis | `GET /ministries` | Secretaria, pastor, líder, admin técnico |
| Listar escalas da congregação | `GET /rosters` | Os mesmos papéis. Membro recebe 403 |
| Criar escala | `POST /rosters` | Liderança. Esta tela sempre envia o `ministryId` do slug reconhecido |
| Função | `POST /rosters/:id/slots` | Liderança, escala `DRAFT` |
| Designar | `POST /slots/:id/assignments` | Liderança, escala não `CLOSED` |
| Confirmar / recusar | `POST /assignments/:id/confirm` e `/decline` | Liderança, ou membro se `personId` da atribuição for o da sessão |
| Substituir | `POST /assignments/:id/substitute` | Liderança. Membro não |
| Publicar / fechar | `POST /rosters/:id/publish` e `/close` | Liderança. Publicar pode enfileirar alerta no outbox mock já existente. Esta tela não reenvia alerta |

Slugs aceitos, nesta ordem: Atmosfera `atmosfera`. Louvor `louvor`, depois o registro sintético `louvor-demo` que o seed já grava. Escala com `ministryId` nulo ou de outro ministério não entra na visão.

O bloqueio exibido na tela é calculado sobre o JSON de `GET /rosters` com a mesma ocupação do serviço: titular ou par, status `PENDING` ou `CONFIRMED`, mesmo instante. `DECLINED` e `SUBSTITUTED` liberam o horário. A API continua sendo quem recusa, com `ROSTER_SERVICE_CONFLICT` na designação/confirmação e `ROSTER_INTERNAL_CONFLICT` na publicação quando a pessoa se repete dentro da escala.

Disponibilidade, impedimento e exceção de casal já são validados por esses endpoints. Esta frente não grava esses cadastros de novo.

## BLOCKED

| Item | Por quê |
|---|---|
| Issue #97 | Não há vínculo formal pessoa–ministério, equipe de Louvor nem ensaio. A tela não cria ministério e não inventa ensaio a partir de `scheduleText` |
| PR #101 | A matriz RBAC nova não está na `main`. A tela não simula essa matriz |
| Agenda do membro | Não existe `GET` das atribuições da própria pessoa. Meu Espaço pede o id da atribuição e não lista terceiros |
| Mensagens | Reenvio `POST /assignments/:id/alerts/resend` não é exposto |
| Design System #93 / PR #102 | Não está na `main`. O visual usa os tokens já publicados |
| E2E na HML real | Esta branch não tem o banco de homologação. Os testes automatizados cobrem o contrato. A navegação local usa a própria UI |

Meu Espaço, ao abrir, chama só `GET /auth/me`. A carteirinha continua em `/app/membros/carteirinha/`. O botão de permissão chama `GET /rosters`, descarta o corpo e mostra apenas 403, autorizado ou indisponível.
