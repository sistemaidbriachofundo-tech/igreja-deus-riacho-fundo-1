# Fase Eklesia — contrato de integração e limpeza

**Fonte de verdade:** [issue #125](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/issues/125).  
**Responsável pela integração:** [issue #133](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/issues/133).  
**Alvo de homologação:** `https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/`.  
**Invariante:** frontend GitHub Pages estático != API HML Vercel. Deploy de código web não atualiza automaticamente a API.  
**Ambiente:** exclusivamente dados sintéticos RF1 na Neon HML, nenhuma operação real financeira, mensagem ou informação sensível de pessoas da igreja.

## 1. Produto como uma única plataforma

O objetivo não é somar oito interfaces. Cada usuário autentica uma vez e chega a um painel adequado ao seu papel. Registros, buscas, ações, notificações de estado e relatórios compartilham chaves estáveis, não cópias desconectadas da mesma informação.

### Identidade, escopo e relações

- **Pessoa:** `personId` é a chave estável para ficha, família, vínculo de membro, admissão, credencial, participação ministerial, agenda própria e presença. Não reconciliar pessoas por nome ou e-mail.
- **Congregação:** cada operação conserva `churchId` ativo e `organizationId`, com autorização no backend para qualquer nova rota. Membro/voluntário nunca vê pessoas de outra igreja.
- **Ministério:** `ministryId` identifica equipe e liderança. Interesse de voluntariado **não** equivale a ingresso formal. Só persistência explícita cria integrante. Permissão do líder deve ser conferida para o ministério indicado.
- **Escala:** cada atribuição de `personId` relaciona contexto de ministério e atividade/roster por IDs estáveis. A visão do líder e o Meu Espaço devem ler a mesma atribuição persistida; aceitar/recusar deve atualizar ambos.
- **Evento:** `eventId` referencia modalidades, inscrições e presenças/check-in. Inscrição não implica membresia. Não inventar relações entre pessoa e inscrito quando a API não comprovar vínculo.
- **Conteúdo:** versão de rascunho, revisão e publicação distintas; somente conteúdo efetivamente publicado vai para portal público.

### Jornada 1: Secretaria / ficha 360

`/app/secretaria/` ou `/app/membros/` → pesquisa → seleção da pessoa → `/persons/:personId` / `/persons/:personId/dossier` (quando autorizado) → família, vínculos, admissões, documentos e histórico → edição via API autenticada → reabrir **mesmo personId**.

**PASS:** dados persistem ao recarregar; 409 de concorrência exibido; 401 invalida token somente quando real, 403 não desconecta; usuário sem papel autorizado não recebe o dossiê nem informações pastorais. Não usar uma segunda base local de pessoas.

### Jornada 2: Pessoa → ministério → escala → Meu Espaço

Ficha → vínculo formal com `ministryId` e função → integrante aparece na equipe do líder → líder cria/edita atribuição com `rosterId`/atividade → membro autentica e vê **sua** agenda, sem digitar IDs → confirma/recusa → líder visualiza atualização na mesma escala.

**PASS:** persistência no banco de HML, filtro por `personId` no servidor, líder de outro ministério recebe 403, membro alheio não vê atribuições de outra pessoa; prevenção de repetição da mesma pessoa no mesmo dia conforme regra da igreja. Não disparar WhatsApp/e-mail. O endpoint de vínculo formal hoje conhecido como 501 não pode continuar sendo anunciado como operação funcional.

### Jornada 3: Evento → participação → presença → relatório

Gestor cria evento em `/events`, edita, publica quando permitido → cria ou consulta inscrições de `/events/:eventId/registrations` → registra check-in por `/registrations/:registrationId/check-in` → relatório de presença e participantes reconcilia com os registros persistidos. A agenda pública só deve apresentar eventos publicados.

**PASS:** números batem com consultas reexecutadas ao banco, não com contadores simulados; 403 por pessoa sem autorização, sem pagamento bancário, sem duplicar evento em CMS e cadastro de eventos como duas entidades distintas.

### Jornada 4: Editor → publicador → público

Editor autenticado opera `/cms/site-layout` e salva rascunho; o publicador revisa e executa publicação; somente o site publicado é visível publicamente. Verificar CORS/origem/site, metadados e histórico de versões.

**PASS:** editor sem permissão recebe 403 ao tentar publicar, publicador publica, atualização persiste, página pública mostra versão autorizada. O `/w1-estudio/` de prévia não substitui este fluxo.

### Jornada 5: Financeiro e visões por ministério

Somente contabilidade sintética com ledger e autorizações reais da API HML; valores de despesa, recebíveis, centros de custo e posição financeira reconciliam sem dupla contagem. Não criar fatura, saldo, banco, Pix ou maquininha fictícios para sugerir que integração real existe.

## 2. Acesso por persona e navegação

O menu público apresenta apenas **Início, Quem Somos, Agenda e Login**. Nenhuma ferramenta interna ou tela de ministérios fica na página pública. No login, o painel mostra apenas funções às quais o papel possui acesso e cuja API HML está realmente disponível. A proteção de rotas no frontend é complementar; **o servidor decide**.

| Persona | Jornada principal | Visões secundárias conforme autorização |
| --- | --- | --- |
| Administrador técnico | Configurações, usuários e auditoria autorizada | Não mostrar notas pastorais ou finanças automaticamente |
| Secretaria | Pessoas, família, admissões, carteirinhas | Eventos e fichas autorizadas |
| Pastor | Acompanhamento pastoral permitido e pessoas atribuídas | Histórico e eventos permitidos |
| Tesouraria | Contas, lançamentos, conciliação sintética | Centro de custo ministerial autorizado |
| Líder de ministério | Equipe, atividades e escalas do **seu** ministério | Presença/relatórios pertinentes |
| Membro | Meu Espaço, minha escala, minha carteirinha | Agenda pessoal |
| Editor de site | Conteúdo, mídia e rascunhos | Prévia de publicação |
| Publicador de site | Aprovação, publicação e versões | Conteúdo e mídia autorizados |

**Experiência final:** título humano, breadcrumbs e ações coerentes; sem rótulos técnicos de status como `501`, `BLOCKED`, `HML Fase 1`, `API`, `mock` no menu normal. Ambiente de homologação pode conter identificação discreta, sem fingir que uma operação não suportada foi concluída. Quando uma funcionalidade realmente não existe, **não inserir botão ativo**; ocultar do fluxo principal ou utilizar estado de indisponibilidade claro para QA.

## 3. Limpeza de código rastreável

Inventário inicial a **investigar** (não deletar cegamente):

- `apps/web/src/app/app/demo/page.tsx` persiste demonstração no `localStorage` e não chama API; não deve concorrer com a ficha real.
- `apps/web/src/app/app/page.tsx` escolhe entre `HmlPhaseOne` e `ChurchDashboard` por flag.
- `apps/web/src/app/app/membros/page.tsx` escolhe entre `HmlPhaseOne` e `MemberDirectory`.
- `apps/web/src/app/app/secretaria/page.tsx` escolhe entre `HmlPhaseOne` e `ChurchSecretary`.
- `apps/web/src/app/app/operacao/page.tsx` abre `DasOperations`, que pode conflitar conceitualmente com telas de ministério, escalas, finanças e eventos especializadas.
- `AppShell` oferece hoje navegação administrativa genérica mesmo quando certas APIs estão incompletas.

**Procedimento obrigatório do integrador H (#133):**

1. Gerar inventário de rotas, imports/reexports, referências em testes, URLs antigas e dependências reais (incluindo import dinâmico). Classificar `ATIVO`, `LEGADO COM USUÁRIO`, `FALLBACK DE SEGURANÇA`, `ORFÃO`, `TESTE`.
2. Consolidar por domínio: um fluxo real de pessoa e um domínio real por módulo. Não duplicar conceitos e estados locais desnecessários.
3. Remover `ORFÃO` somente após confirmar ausência de referências e garantir regra de redirecionamento/404 para URL obsoleta. Remover CSS, libs e mocks não usados apenas com testes.
4. **Nunca remover:** migrations já aplicadas, modelos/contratos em uso, trilhas de auditoria, autenticação/guards, barreiras de segurança, dados do usuário, fixtures necessárias à suíte e caminhos de rollback.
5. Executar lint, typecheck, testes, Next static export, 401/403 negativos, E2E de regressão em URLs e menu, mobile 360/768/1440 e zoom 200%; revisar screenshots sem aprovar só por build verde.
6. Registrar no PR de integração o que foi removido, motivo, evidências de referência zero, riscos e como reverter.

## 4. Integração dos agentes

- **A #126:** ficha 360° e Secretaria.
- **B #127:** vínculo formal, equipe e liderança.
- **C #128:** escala e Meu Espaço.
- **D #129:** navegação e painéis por papel, sem menús técnicos/duplicados.
- **E #130:** eventos e relatórios.
- **F #131:** CMS persistente/portal publicado.
- **G #132:** QA independente por persona e jornada **cruzada**.
- **H #133:** único responsável por schema, migrations, shared, resolução transversal de conflitos, limpeza cross-module, API HML, GitHub Pages e rollback.

Nunca dois agentes editam o mesmo arquivo central em paralelo. O integrador H combina branches e negocia contratos entre A–F antes de merge.

## 5. Definition of Done e gates de publicação

Não concluir a fase por captura de tela, PR, build isolado, branch ou site que apenas carrega HTML.

- [ ] Ficha busca→abre→edita→reabre dados no **mesmo personId**.
- [ ] Pessoa→ministério formal→escala→membro confirma→líder vê mudança.
- [ ] Evento→inscrição→presença→relatório, tudo persistido.
- [ ] Editor→publicador→público, sem publicação indevida.
- [ ] Oito personas com menus coerentes e testes positivos+401/403 negativos.
- [ ] Código legado demonstrativo removido **ou isolado** após análise de referências, sem regressões.
- [ ] API HML Vercel efetivamente atualizada e verificada; Neon HML consistente.
- [ ] E2E autenticado real e visual de 360/768/1440, teclado e zoom 200% PASS.
- [ ] PR de integração aprovado, CI completo verde, merge na `main`.
- [ ] GitHub Pages oficial do SHA final: **Deploy Pages SUCCESS + Smoke SUCCESS**.
- [ ] Usuário recebe link oficial e roteiro por persona. Se item crítico pendente: **EM EXECUÇÃO**, não CONCLUÍDO.

**Não autorizado:** mensagens reais, transações, bancos/PSP, dados privados reais da igreja, alterações em outros projetos.