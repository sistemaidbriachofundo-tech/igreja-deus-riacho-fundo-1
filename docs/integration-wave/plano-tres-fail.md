# Plano para zerar os 3 FAIL de ficha

Os FAIL estão no PR #104 e se repetem no fonte da main. A API da mesma jornada passou: busca, `GET /persons/:id`, PATCH idempotente e releitura. Esta frente não implementa a tela e não marca esses itens como PASS.

## Os três itens

1. **Abrir ficha na interface.** A busca em `/app/membros/` filtra a pessoa sintética do seed. A linha não oferece ação de abrir.
2. **Editar ficha na interface.** Não há formulário ligado ao PATCH.
3. **Reabrir ficha na interface.** Sem a ficha aberta, não há como sair e voltar ao mesmo registro.

## Implementação, dono #91

Arquivo preferencial: `apps/web/src/components/HmlPhaseOne.tsx` ou componente novo montado por essa visão. Fora de escopo: `LoginScreen`, `AdminAccessGate`, `AppShell`, `apps/web/src/lib/api.ts`, guards, `schema.prisma` e `packages/shared`.

Fluxo funcional, com conta sintética de Secretaria já usada pelo #104:

1. Entrar, buscar a pessoa sintética, acionar abrir.
2. A UI chama `GET /persons/:id` e o dossier existente. Mostra só campos que a API devolve.
3. Alterar um campo que o PATCH aceita (`isMinor`, `legalGuardianPersonId` ou `householdId`). Campos sem suporte no `PatchPersonBody` aparecem como indisponíveis, sem valor inventado.
4. Salvar e reler o mesmo id. Fechar a ficha e reabrir: o valor persistido volta.
5. Em 403, 404, 409 e timeout, o formulário fica preenchido e o token permanece. Em 401, a sessão encerra pelo contrato do #103.
6. O catch atual de `refresh(stored)`, que chama `clearToken()` para qualquer erro, passa a tratar só 401. Sem isso, o reload resiliente do #103 é desfeito dentro da página.

## Prova, dono QA #104 em nova execução

Rodar a suíte de persona já escrita, no conjunto rebaseado #103 + PR da #91, com Chrome e o seed fictício. Os três ids de interface mudam para PASS somente com evidência de tela (captura ou vídeo) e com a releitura da API. Até lá o classificador desta frente continua FAIL se o botão não existir, ou BLOCKED se o botão existir e o E2E ainda não tiver rodado.

Larguras 360, 768 e 1440 da ficha entram nessa mesma execução. Overflow horizontal 0 px no diretório, medido hoje, não cobre o painel da ficha.

## O que não zera os FAIL

- Merge do #103, do #101 ou do #102.
- Verde de lint, typecheck, build ou deste `node --test`.
- O PASS atual de `GET` e `PATCH` na API.
