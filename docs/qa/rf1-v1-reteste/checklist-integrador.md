# Checklist do integrador — reteste 935fd53

QA apenas. Não promover, não desproteger o SSO, não aplicar seed e não chamar a API de produção.

- [ ] Ler `readyState` de `dpl_AiFBhKCKAjuZp4qxmKzPC46FV3HA` com uma conta do time. O agente recebeu 403 `missingToken`.
- [ ] Confirmar se esse deployment serve `935fd53e8187b840084a845e418dcb06cbd13956`. O alias em 2026-11-10T17:55:45Z respondeu 302 para o login da Vercel. Isso não identifica o SHA.
- [ ] Abrir a prévia já autenticado na Vercel e repetir os 19 BLOCKED. Não tratar a tela de login da Vercel como tela da igreja.
- [ ] Não converter ausência de senha HML em defeito. Esta rodada não enviou login.
- [ ] Separar os rótulos “Cadastrar pessoa” e “Iniciar admissão” no ramo que a prévia realmente compila. Os dois ramos atuais falham o critério.
- [ ] Fazer a carteirinha montada distinguir conflitos 409. `ChurchCredentials` ainda usa uma frase única. A diferenciação está em `HmlPhaseOne`, que essa rota não monta.
- [ ] Atualizar os testes que abrem `demo`, `ministerios`, `ministerios/[slug]` e `w1-estudio`, e a expectativa de pouso do líder em `/app/operacao/`. O Actions `42869490913` ficou com Test em failure e Build ignorado.
- [ ] Rodar `verify-export.mjs` num artefato desse SHA. O script foi editado e não executou.
- [ ] Decidir o que fazer com `W1PortalStudio.tsx`, `DasOperations.tsx` e a descrição “Church OS” em `layout.tsx`. As páginas correspondentes já saíram.
- [ ] Publicar o valor de `NEXT_PUBLIC_HML_ENABLED` da prévia. Com a flag desligada, o shell anônimo entra em modo preview.
- [ ] Só depois de sessão sintética: dashboard, ficha com recarga, carteirinha, revogação e um ministério de cada vez. READY não conta como essa jornada.
