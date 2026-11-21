# Rodada de QA funcional, UX e UI — 19/11/2026

Auditoria e documentação. Nenhuma alteração de código de produto, nenhuma promoção para HML ou produção, nenhuma mudança de permissão no DEV e nenhuma comunicação a pessoa real. A evidência usa somente contas e massa fictícias. Senhas, tokens, segredos e dados pessoais não entram neste registro.

## Ambiente

| Item | Registro |
|---|---|
| SHA pedido e conferido | `af3fbd67f8d794b15c8518b92bd1d56c1a693c34` |
| Branch de código | `feat/rf1-revisao-18-11` |
| Web DEV | `https://id-riacho1-web-hml-git-0d6b26-gustavomarqueslopes-cmds-projects.vercel.app/` |
| API de testes | `https://id-riacho1-api-qa.vercel.app/` |
| API DEV `/ready` | HTTP 200, `database=ok`, `authState=prisma`, `mfaBlocking=true`, `commit=af3fbd67f8d7` |
| Web DEV | HTTP 302 para o host `vercel.com` (proteção SSO). Nenhuma tela autenticada foi aberta nesse endereço. |
| Login DEV | As oito contas fictícias do seed responderam HTTP 401 `INVALID_CREDENTIALS` com a senha documentada para uso local. O segredo de QA não está disponível neste agente. MFA do DEV não foi exercido e nenhuma conta foi alterada. |
| Base descartável | PostgreSQL 16 local, 50 migrações do SHA, seed fictício, API em `127.0.0.1:3001` e web em `127.0.0.1:3000`. `F11_MFA_BLOCKING` desligado. `authState=memory`. Isso não substitui o aceite no DEV. |

Viewports usados na base local: 1440×900 e 390×844. Teclado, foco, contraste computado, filtro, acesso pela navegação e fecho por botão e por Escape foram exercitados nos fluxos prioritários.

## 1. Aniversariantes — fechar a ficha

Critério pedido: em Pastoral e em Secretaria, Abrir ficha e depois Fechar devolve a mesma lista, o mesmo período, a mesma rolagem e o mesmo foco. Vale para o botão Fechar e para Escape.

O link Abrir ficha sai da agenda. Na Pastoral o destino é `/app/pastoral/admissoes/?pessoa=…`. Na Secretaria o destino é `/app/secretaria/?pessoa=…`. Fechar remove o parâmetro e permanece na tela de destino. A agenda, o período e a rolagem não são restaurados.

| Papel | Fecho | Antes | Depois | Resultado |
|---|---|---|---|---|
| Administrador | Botão Fechar | `/app/pastoral/aniversariantes/`, período Este mês, rolagem 640, foco no link | `/app/pastoral/admissoes/`, filtro Em andamento, rolagem 0, título Admissões pastorais | Não restaura |
| Administrador | Escape | Igual ao caso anterior | Igual ao caso do botão | Não restaura |
| Pastor | Botão Fechar | Agenda pastoral, Este mês, rolagem 640 | Admissões pastorais, rolagem 0 | Não restaura |
| Secretaria | Escape | `/app/secretaria/aniversariantes/`, Este mês, rolagem 640 | `/app/secretaria/`, rolagem 0, título Secretaria | Não restaura |

O período Este mês funciona antes da saída. A lista local tinha 24 aniversariantes fictícios, o bastante para rolar. O estado vazio de Hoje também apareceu, porque a massa não tinha aniversário na data corrente.

Classificação: **corrigir**. Prioridade alta. Dependência: nenhuma. O retorno precisa guardar lista, período, rolagem e foco nos dois perfis e nos dois fechos.

## 2. Admissões pastorais, botão verde e documentos

### Botão verde sem texto

Em 1440 px, o único controle do protocolo para o Administrador é o botão cujo nome acessível é “Abrir ficha de …”. A cor do texto e a do fundo foram `rgb(36, 96, 81)`. Contraste calculado: **1:1**. O rótulo some. O Pastor vê o mesmo botão verde sem texto legível e, ao lado, “Recusar admissão” e “Aprovar admissão”, com texto branco e contraste **7,32:1**.

A causa está no CSS: `.directoryPanel .openFicha` pinta o texto com `--app-accent` e `.admission button:not(:disabled)` pinta o fundo com a mesma variável. Em 390 px a página do Administrador não teve overflow horizontal.

A API recusou a decisão do Administrador com HTTP 403 `ADMISSION_ROLE_REQUIRED`. O Pastor aprovou um protocolo fictício e recusou outro, com motivo fictício. A decisão permanece restrita ao Pastor. O defeito é de apresentação e de acessibilidade, não de autorização.

Classificação: **corrigir**. Prioridade alta. Dependência: nenhuma.

### Documentos e modalidade

Percurso na base descartável, com arquivos PDF mínimos e nomes fictícios (`certidao-casamento-ficticia.pdf` e `diploma-teologia-ficticio.pdf`):

| Modalidade | Avanço da documentação sem arquivo | Upload pela Secretaria | Lista e abertura pelo Pastor | Membro |
|---|---|---|---|---|
| Batismo | HTTP que levou a Aguardando Secretaria | 201 | Lista 200 e abertura `application/pdf` | 403 |
| Transferência | Igual, sem arquivo | 201 | Igual | 403 |
| Aclamação | Igual, sem arquivo | 201 | Igual | 403 |

Não há tipo de documento, exigência por modalidade nem bloqueio quando o protocolo segue sem anexo. A ficha, na visão geral, não mostra o arquivo. A interface não oferece campo de envio nem controle para abrir o anexo. O componente só escreve nome, tipo e tamanho quando a aba de documentos está selecionada.

Classificação: **implementar** a regra por modalidade e o envio, a consulta e a abertura na interface; **corrigir** o avanço sem anexo. Prioridade alta. Dependência: definição da igreja sobre quais documentos cada modalidade exige. A decisão pastoral deve continuar dentro da Pastoral.

## 3. A mesma despesa na Tesouraria e na Pastoral

Massa fictícia de R$ 123,45 em despesa de caixa e de R$ 80,00 em conta a pagar. Competência novembro de 2026, período aberto.

| Passo | Observado |
|---|---|
| Tesouraria cria despesa de caixa em `/ledger/expenses` | `PENDING_APPROVAL`, fluxo `TREASURER_THEN_PASTOR`. A Tesouraria já fica como primeira aprovação. |
| Repetir o mesmo envio | Devolve o mesmo lançamento. |
| Repetir o envio com outro valor | HTTP 409. Não duplica. |
| Pastor consulta aprovações | HTTP 200 e vê o lançamento. Membro recebe 403. |
| Pastor aprova | `APPROVED`. |
| Tesouraria tenta a aprovação final | HTTP 403. A mensagem atribui a aprovação final ao Pastor. |
| Pastor devolve outra despesa fictícia | `REJECTED`. |
| Baixa da despesa de caixa | HTTP 400. “A baixa exige uma conta a pagar aprovada.” O crédito já está na conta bancária do próprio lançamento. |
| Conta a pagar | Nasce `DRAFT`. A chave de idempotência gera um único lançamento. |
| Envio da conta a pagar | `PENDING_APPROVAL`. O Pastor não faz a primeira aprovação (403). Outra conta de Tesouraria registra a primeira. O Pastor conclui com `APPROVED`. |
| Registrar pagamento | HTTP 201, método `CASH`, um lançamento “Pagamento · …”. Repetir a baixa devolve o mesmo settlement e não cria outro pagamento. |

O Administrador consulta `/ledger/entries` com HTTP 200. O Pastor recebe 403 em `/ledger/accounts`. A fila pastoral do Pastor foi aberta na interface; a despesa já aprovada não permaneceu nela.

Classificação: **validar** a trilha de papéis, a idempotência e a baixa da conta a pagar. **Corrigir** a expectativa de baixa da despesa de caixa, que não é conta a pagar, e deixar esse estado explícito na tela. **Validar** com a igreja se o Administrador deve ler o ledger. Prioridade alta para a clareza da baixa. Dependência: plano de contas com passivo `2.1` no ambiente compartilhado; a base local não tinha essa conta no seed e a conta fictícia foi criada só no banco descartável.

## 4. Papéis e módulos

Todos os logins abaixo são da base descartável, sem MFA. No DEV o mesmo conjunto ficou em 401.

| Papel | O que passou | O que ficou bloqueado ou incompleto |
|---|---|---|
| Visitante / portal | Portal local em 1440 e 390, sem overflow horizontal. API DEV pública: eventos 200 (16), grupos 200 (1), ministérios 200 (5), gravações 200. | Web DEV atrás de SSO. Dos 16 eventos, 2 slugs contêm `demo` e 14 não. Títulos não foram copiados. |
| Convidado | Cadastro fictício local criou papel `CONVIDADO`. `GET /member-events/registrations` 200. | 403 em pastoral, ledger e admissões. Política de senha recusa senha curta e senha fora do padrão. |
| Membro | `GET /credentials/me` 200. 403 em busca de pessoas, pastoral, ledger, aniversários e CMS. | `GET /member-events` 404. A rota existente é `/member-events/registrations`. |
| Secretaria | Busca de pessoas, aniversários do mês e admissões. | Ficha de aniversariante não volta à agenda. Sem upload na interface. |
| Pastor | Fila de admissões, aprovação, recusa, devolução de despesa e aprovação final. 403 no plano de contas. | Botão “Abrir ficha” ilegível. Cuidado pastoral e Ordem de Culto não têm aceite no DEV. |
| Tesouraria | Contas, despesa, conta a pagar, pagamento e notificações 200. | Baixa não se aplica à despesa de caixa. |
| Administrador | Acessos 200, auditoria 200, aniversários 200, ledger 200. Decisão pastoral 403. | Botão verde sem texto. Edição bem-sucedida de perfil não foi executada. |
| Líder de ministério | Ministérios e escalas 200. | `GET /admin/access` e alteração de perfil 403. |
| Líder de módulo | As opções de acesso do Administrador trazem 6 ministérios, cada um com módulos. | A troca efetiva de escopo não foi gravada, para não alterar grants nem nesta base. |
| Editor | CMS 200. Auditoria 403. | Ciclo de publicação não reexecutado. |
| Publicador | CMS 200. | Publicação no DEV não executada por causa do SSO e do MFA. |

Escalas mensais, notificações, inscrição, check-in, Conexão, grupos, carteirinha, relatórios e conteúdo têm rota e, em vários casos, resposta de API coerente com o papel. A varredura visual autenticada no DEV não ocorreu. Teclado e contraste foram medidos nos fluxos de aniversário e admissão. O defeito de contraste do botão verde é o achado de acessibilidade desta rodada.

## 5. DAS RF-001 a RF-032 e Ordem de Culto

Legenda: **corrigir** = comportamento presente e inadequado; **implementar** = capacidade ausente; **validar** = há implementação, mas o aceite no DEV com as contas autorizadas ainda não ocorreu nesta rodada.

| RF | Classe | Prioridade | Dependência | Evidência desta rodada |
|---|---|---|---|---|
| RF-001 Pessoa | validar | média | Login DEV | Busca 200 para Secretaria e 403 para Membro. Ficha abre, mas o retorno da agenda falha. |
| RF-002 Famílias | validar | média | Login DEV | Famílias aparecem na Secretaria. Guarda de menor não foi reexecutada. |
| RF-003 Histórico | validar | média | RF-001 | Histórico da ficha abre. Jornada completa não foi aceita no DEV. |
| RF-004 Acesso | corrigir o bloqueio de aceite; validar o comportamento | alta | Senha de QA e MFA do DEV, ou bypass autorizado do SSO | DEV em 401 e MFA obrigatório. Local autentica os oito papéis sem segundo fator. |
| RF-005 Admissão | corrigir | alta | Lista de documentos exigidos por modalidade | Ver seções 1 e 2. |
| RF-006 Cartas | validar | média | RF-005 | API presente. Emissão não executada. |
| RF-007 Carteirinha | validar | média | Login DEV | `GET /credentials/me` 200 para Membro. Leitura de QR no aparelho não feita. |
| RF-008 Acolhimento | validar | média | Login do Pastor no DEV | `GET /pastoral-cases` 200 Pastor e 403 Membro. |
| RF-009 Sigilo pastoral | validar | alta | RF-008 | O bloqueio por papel se manteve. A auditoria de leitura indevida não foi percorrida. |
| RF-010 Conexão | validar | média | Login DEV | Rotas e migração presentes. Operação de mentor não reexecutada. |
| RF-011 Grupos | validar | média | Autorização de publicação | API DEV devolveu 1 grupo. Vitrine e decisão de líder não abertas no navegador. |
| RF-012 Ministérios | validar | média | Lideranças | Líder consulta ministérios. Catálogo visual do DEV não aberto. |
| RF-013 Escalas | validar | média | Postos do Kairos | `GET /rosters` 200 para o líder. Publicação mensal não operada no DEV. |
| RF-014 Casais | validar | baixa | RF-013 | Regras no código. Caso de casal não executado. |
| RF-015 Confirmação e substituição | validar | média | RF-013 | Rotas presentes. Voluntário não percorreu o convite nesta rodada. |
| RF-016 Financeiro | corrigir a baixa da despesa de caixa; validar o restante | alta | Plano de contas `2.1` e Tesouraria no DEV | Seção 3. |
| RF-017 Extratos | validar | média | Arquivo fictício e RF-016 | Importação não executada nesta rodada. |
| RF-018 Conciliação | validar | média | RF-017 | Seed tem conciliação demonstrativa. Fechamento não operado. |
| RF-019 Orçamento e estorno | validar | média | RF-016 | Período de novembro de 2026 estava aberto na base local. |
| RF-020 Eventos | validar | média | Revisão editorial | API DEV pública com 16 eventos. |
| RF-021 Inscrição e check-in | validar | média | RF-020 | Convidado leu as próprias inscrições. Check-in e Pix não percorridos. |
| RF-022 Alojamento e menores | validar | baixa | RF-021 | Migração presente. Fluxo de interface não executado. |
| RF-023 Cursos | validar | baixa | Decisão de certificação | Rotas presentes. Não executado. |
| RF-024 Conteúdo | validar | média | SSO e MFA | Editor e Publicador leem CMS no local. Membro recebe 403. |
| RF-025 Canais | validar | média | Provedores autorizados | Sem SMTP live nesta base. Nenhuma mensagem externa foi enviada. |
| RF-026 YouTube e Instagram | validar | baixa | Canal oficial | `GET /public/youtube-recordings` 200 no DEV. Conteúdo não inspecionado. |
| RF-027 Vivi | validar | baixa | Política de IA | Rota presente. Conversa não executada. |
| RF-028 App nativo | implementar | baixa | Decisão de loja | Não há app Android/iOS. O web local coube em 390 px nas telas medidas. |
| RF-029 Indicadores | validar | média | RF-001 | Aniversários por período respondem aos papéis autorizados. |
| RF-030 Congregações | validar | média | Segunda congregação autorizada | Escopo do seed permaneceu na congregação piloto. |
| RF-031 Auditoria | validar | média | RF-004 | Administrador 200 e Editor 403 em `/audit-logs`. |
| RF-032 Acessibilidade | corrigir | alta | Nenhuma | Contraste 1:1 no botão de abrir ficha. Escape não devolve o foco à agenda. |
| OC Ordem de Culto | implementar | alta | Grade de culto e decisão pastoral | Nenhuma rota, modelo ou tela com esse nome no SHA. |

## Backlog

1. **Corrigir** o retorno de Aniversariantes na Pastoral e na Secretaria. Prioridade alta. Sem dependência. Aceite: botão Fechar e Escape devolvem lista, período, rolagem e foco em 1440 px e 390 px.
2. **Corrigir** o contraste do botão Abrir ficha nas admissões. Prioridade alta. Sem dependência. Aceite: texto visível, contraste de pelo menos 4,5:1, nome acessível igual ao texto, comparado entre Administrador e Pastor.
3. **Corrigir e implementar** a documentação da admissão. Prioridade alta. Depende da lista de exigências por modalidade. Aceite: não avança sem o conjunto exigido; Secretaria envia; Pastor e Secretaria abrem o arquivo; Membro recebe 403; histórico guarda aprovação e recusa.
4. **Corrigir** a apresentação da despesa de caixa diante da conta a pagar. Prioridade alta. Depende do plano de contas `2.1` no DEV. Aceite: despesa de caixa não oferece baixa de conta a pagar; conta a pagar só baixa depois da aprovação e a repetição não duplica o pagamento.
5. **Validar** no DEV, com SSO e MFA das contas fictícias autorizadas, os papéis que aqui só rodaram na base descartável. Prioridade alta. Depende do segredo de QA e da proteção do preview. Sem isso o aceite visual do Gustavo continua bloqueado.
6. **Implementar** a Ordem de Culto pedida para a Pastoral. Prioridade alta. Depende da grade de culto e de quem pode publicá-la. Não há base pronta no SHA.
7. **Validar** a edição de perfil e de escopo do líder de módulo com uma conta fictícia, incluindo sucesso e recusa de quem não administra acessos. Prioridade média. Depende do item 5. Nesta rodada só foram confirmadas a consulta do Administrador e a recusa do líder.
8. **Validar** escalas mensais, substituição, eventos, check-in, Conexão, grupos, carteirinha, relatórios e publicação no navegador do DEV. Prioridade média. Depende do item 5.
9. **Validar** os 14 eventos públicos da API de testes cujo slug não traz `demo`, antes de qualquer exposição fora do DEV. Prioridade média. Depende de revisão editorial. Títulos não foram reproduzidos.
10. **Implementar** app nativo só se a igreja confirmar que o web responsivo não cumpre o RF-028. Prioridade baixa. Depende dessa decisão.

## Critério de aceite desta auditoria

A rodada registra ambiente, SHA, papel, viewport, passos, esperado, observado, impacto e a classe de cada item. O aceite institucional no DEV permanece aberto enquanto o SSO e o MFA impedirem a sessão. A base descartável cobre a reprodução dos três defeitos prioritários e a trilha de despesa, sem usar dado real.
