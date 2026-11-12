# Checklist liberatório

Decisão desta coleta: **NAO LIBERAR**.

| Porta | Estado | Por quê |
| --- | --- | --- |
| Árvore é o SHA candidato | PASS | HEAD igual à candidata. |
| MFA bloqueia JWT privilegiado | FAIL | F11-MFA-01 e F11-MFA-02. |
| Sessão revogável | FAIL | F11-JWT-01 e F11-JWT-02. |
| Limite não forjável e compartilhado | FAIL | F11-RATE-01 e F11-RATE-02. |
| E2E autenticado no deploy deste SHA | BLOCKED | A origem consultada anunciou 6c43aea96ad3fe24ec1ed2c09f717963fb289c62. O roteiro autenticado não rodou. |
| Frentes A, B e C integradas | BLOCKED | Nenhum head remoto com nome de F1.1-A, B ou C apareceu nesta coleta. As issues #185, #186 e #187 seguem sem PR nesta prova. Integração BLOCKED. |
| CI desta branch | BLOCKED | O workflow atual dispara em pull request para `main`. Esta frente não edita workflow. O PR contra `previa/rf1-v1` não herda esse job. |
| `npm audit --omit=dev` limpo | FAIL | 20 controles de código em FAIL; o audit segue com altos no lockfile. Ver `cves.md`. |
| Pronto para produção | FAIL | A própria issue da fase diz que nada está pronto antes de MFA real, sessão revogável, limite compatível com escala e E2E autenticado. |

P0 estáticos em aberto: F11-MFA-01, F11-MFA-02, F11-JWT-01, F11-JWT-02, F11-RATE-01.
