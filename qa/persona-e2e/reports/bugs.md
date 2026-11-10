# Achados da frente G

Estes itens saíram da execução. PASS não entra aqui. Nenhum deles autoriza merge ou deploy.

| ID | Persona | Resultado | Jornada | O que foi observado |
|---|---|---|---|---|
| G/auth-publicador | EDITOR | BLOCKED | Login e /auth/me de PUBLICADOR | O catálogo tem PUBLICADOR_SITE, mas o seed sintético não cria a conta (login HTTP 401). Sem usuário, /auth/me não foi exercido. Nenhum segredo foi registrado. |
| G/auth-hml-remota | PLATAFORMA | BLOCKED | API HML remota | Não há HML_PUBLIC_API_URL nem segredo de homologação neste agente. A matriz acima é da API sintética local. O link oficial não recebe esta suíte autenticada. |
| G/ministerios-persistencia | LIDER | BLOCKED | Vínculo formal do ministério autorizado | HTTP 501 MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED e members nulo. A API não grava integrante formal. O schema é do integrador H. A resposta não inventa a lista. |
| G/cms-publicador | EDITOR | BLOCKED | Conta sintética de publicador | O catálogo tem PUBLICADOR_SITE, mas o seed sintético não cria a conta (login HTTP 401). Sem usuário, /auth/me não foi exercido. Nenhum segredo foi registrado. |
| G/menu-secretaria | SECRETARIA | FAIL | Menu por papel | Menu genérico. Fora do papel: Tesouraria. |
| G/menu-membro | MEMBRO | FAIL | Menu por papel | Menu genérico. Fora do papel: Membros e famílias, Secretaria, Ministérios e operação, Vínculo de ministério, Escalas, Tesouraria, Mídia e conteúdo, Gestão do site. |
| G/agenda-persistencia | MEMBRO | BLOCKED | Agenda própria persistida | Não existe agenda própria persistida para este perfil (listagem HTTP 403). Confirmar pelo identificador não substitui a lista. |
| G/menu-tesouraria | TESOURARIA | FAIL | Menu por papel | Menu genérico. Fora do papel: Membros e famílias, Secretaria, Carteirinhas, Ministérios e operação, Vínculo de ministério, Escalas, Meu Espaço, Mídia e conteúdo, Gestão do site. |
| G/layout-ministerios-360 | SECRETARIA | FAIL | Vínculo de ministério em 360px | Overflow horizontal de 78px. |
| G/pages-login | PUBLICACAO | BLOCKED | Formulário oficial habilitado | O botão de entrar do link oficial está habilitado. O workflow da main publica esse site com a API HML. Nenhuma credencial foi enviada daqui. |
| G/pages-hml | PLATAFORMA | BLOCKED | Jornadas autenticadas no link oficial | GET /health da API HML pública respondeu 200 e /meta anuncia o contrato 0.7.2-f2. Não enviei credencial e não tratei esse anúncio como prova de ficha, vínculo, agenda ou editor. A matriz autenticada é da API sintética local. |
