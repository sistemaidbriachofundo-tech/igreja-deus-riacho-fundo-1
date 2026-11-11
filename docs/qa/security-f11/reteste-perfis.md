# Roteiro de reteste dos perfis V1

Rodar só depois que a frente A publicar o desafio MFA, numa API cujo `/meta.sourceSha` seja o commit integrado. Usar a senha do seed sintético pela variável de ambiente já adotada no QA, sem gravá-la no relatório. Uma tentativa por perfil. Sem reset, sem mensagem e sem carga.

Para cada perfil abaixo:

1. `POST /auth/login` com o e-mail fictício e senha errada. Esperar 401 e a mesma mensagem das outras falhas.
2. `POST /auth/login` com a senha sintética certa. Perfil privilegiado deve receber desafio opaco e não um access token. Perfil comum deve receber sessão só se o integrador tiver deixado esse papel fora do MFA.
3. Repetir o código TOTP correto. O segundo uso do mesmo código deve falhar.
4. Chamar `POST /auth/refresh` e `POST /auth/switch-church` com o token pré-MFA, se a senha ainda devolver algum. Esperar 401.
5. Depois do logout, repetir o access token antigo em `GET /auth/me`. Esperar 401.
6. Trocar o papel da conta sintética e repetir o token anterior. Esperar 401 ou 403, nunca o papel antigo.

| Perfil | Papel | E-mail fictício | No seed | MFA esperado |
| --- | --- | --- | --- | --- |
| admin | PLATFORM_ADMIN | platform.demo@example.test | sim | obrigatório quando a frente A entrar |
| secretaria | SECRETARIA | ana.demo@example.test | sim | obrigatório quando a frente A entrar |
| pastor | PASTOR | pastor.demo@example.test | sim | obrigatório quando a frente A entrar |
| tesouraria | TESOURARIA | tesouraria.demo@example.test | sim | obrigatório quando a frente A entrar |
| lider | LIDER_MINISTERIO | lider.jovens.demo@example.test | sim | confirmar com o integrador se o líder entra no conjunto privilegiado |
| membro | MEMBRO | bruno.demo@example.test | sim | login com senha deve continuar sem trancar a conta sintética |
| editor | EDITOR_SITE | editor.demo@example.test | sim | hoje o controller de MFA não lista este papel; o reteste prova cadastro ou exclusão explícita |
| publicador | PUBLICADOR_SITE | publicador.demo@example.test | não | não há usuário no seed; o roteiro fica bloqueado até existir conta fictícia |

O publicador não tem conta no seed. Enquanto isso, o reteste desse perfil fica BLOCKED. Criar a conta é trabalho de seed, fora desta frente.

Contas privilegiadas da lista: admin, secretaria, pastor e tesouraria. Líder, editor e publicador precisam de decisão explícita do integrador antes de serem cobrados como MFA obrigatório. Membro não pode perder o login por um desafio que o controller atual nem oferece a todos os papéis.

Estado nesta coleta: **BLOCKED**. A frente A não está na árvore e nenhuma senha foi usada.