# Frentes A, B e C

Base exigida: `31d3158c7619bbc4c9d24fd9b94e43ef056ab80e`. Esta frente não edita auth, auditoria nem observabilidade.

Nenhum head remoto com nome de F1.1-A, B ou C apareceu nesta coleta. As issues #185, #186 e #187 seguem sem PR nesta prova. Integração BLOCKED.

| Frente | Issue | Dono | O que o QA precisa retestar | Estado na coleta |
| --- | --- | --- | --- | --- |
| A | #185 | `apps/api/src/auth/**` | Login sem JWT pleno, replay, refresh, logout, grant alterado | ausente |
| B | #186 | `apps/api/src/audit/**` | Metadado recusado na escrita, leitura por papel, trilha preservada | ausente |
| C | #187 | `apps/api/src/common/observability/**` | requestId, log sem segredo, 429 com IP de proxy confiável | ausente |

Quando um PR dessas frentes existir, o reteste desta suíte compara o diff com os IDs FAIL. Teste unitário da frente dona não vira PASS de deploy.
