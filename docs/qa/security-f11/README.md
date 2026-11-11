# QA de segurança F1.1-D

Auditoria independente da candidata V1. Esta pasta é a leitura humana. Os testes estão em `qa/security-f11`.

- Candidata exigida: `31d3158c7619bbc4c9d24fd9b94e43ef056ab80e`
- SHA desta árvore na coleta: `31d3158c7619bbc4c9d24fd9b94e43ef056ab80e`
- Coleta: 2026-11-11T20:06:26.696Z
- Decisão: **NAO LIBERAR**

A análise estática mostra o que o fonte faz. Ela não prova o deploy. O HTTP só entra como prova do SHA candidato quando `/meta.sourceSha` é exatamente esse commit. Homologação de outro commit fica registrada à parte.

Não há segredo, senha, token nem dado de produção nestes relatórios.
