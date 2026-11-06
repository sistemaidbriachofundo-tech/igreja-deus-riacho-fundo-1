# Frontend ID Riacho 1 — baseline de consolidação e aceite

**Data:** 06/11/2026 · **Escopo:** Next.js `apps/web` + design system V6/V7/V8/V9 · **Marco:** portal estático publicável, administração preparada para homologação.

## Decisão executiva
- **Portal institucional:** possui componentes e rotas exportáveis para GitHub Pages. Pronto tecnicamente para **publicação estática**, desde que o último workflow de `main` termine com Pages em `success`. Conteúdos oficiais ainda dependem de validação editorial.
- **Área administrativa ID Riacho 1:** **protótipo funcional com dados sintéticos**, não pronto para cadastro real de membros, famílias, menores, documentos ou casos pastorais. As quatro telas principais compartilham `useChurchRecords` + `localStorage` do navegador, não o PostgreSQL.
- **Estúdio editorial:** UI autenticável quando URL de API segura está configurada, mas não equivale a login institucional operacional. Requer backend HML/PRD homologado.
- **Login no cabeçalho:** direciona para `/app/`, que **é demonstração**, sem sessão de usuário na entrada do painel. Uma dica de contexto informa o caráter demonstrativo.
- **Eventos, ministérios e mensagens públicas:** páginas de apresentação podem conter conteúdo editorial ilustrativo. Agenda/notícias dinâmicas têm release gate para evitar exibir seeds como conteúdo oficial.
- **YouTube:** integração por link com o canal oficial `https://www.youtube.com/@IDBRiachoFundo1`. Não inventar vídeo nem alegar transmissão embutida.

## Entregas existentes
| Camada | Entregas verificadas no repositório |
| --- | --- |
| Identidade | logo circular aprovada, nome ID Riacho 1 na gestão, estilo institucional verde-petróleo/dourado, tipografia Montserrat/Inter |
| Portal público | home cinematográfica, A Igreja, ministérios (5 detalhes), eventos, novidades, contato, primeira visita e jornada de contato |
| Navegação | menu desktop e mobile, link Login antes de Participe conosco, breadcrumbs e navegação do painel |
| Conteúdo | fallback honesto quando `NEXT_PUBLIC_PORTAL_LIVE_ENABLED` não está ativo; publicações dependem de `/public/*` |
| Voluntariado | formulário opcional somente com API HTTPS/local, flags de publicação e URL de política de privacidade HTTPS, com aceite e 18+ |
| Gestão ilustrativa | dashboard, membros/famílias, secretaria, carteirinhas e demonstração F2 com dados locais |
| Editorial | editor com login técnico e operação de CMS/eventos/ministérios/voluntários via API configurada |
| Build | `next build` exportando `out/`; auditoria de HTML, rotas, links e assets via `verify-export.mjs`; capturas responsivas no CI |

## Correções deste fechamento
1. **Falha segura da API:** sem `NEXT_PUBLIC_API_URL` válida, não apontar chamadas para `http://localhost:3001` no navegador público. O fallback para localhost permanece somente em `NODE_ENV=development`.
2. **Busca coerente:** a paleta Ctrl+K busca **módulos e páginas**, não pessoas/eventos. O rótulo foi ajustado ao que realmente funciona.
3. **Cobertura de rotas estáticas:** o verificador de export agora exige também `novidades/`, `status/` e `app/demo/` além das rotas já previstas.
4. **Transparência do Login:** dica contextual de que o botão do site leva ao painel demonstrativo.
5. Testes atualizados para impedir regressões nessas fronteiras.

## Portas de liberação
### Portal institucional estático (GO)
- [ ] CI completo na `main`: lint, TypeScript, testes, build, SonarCloud e job de Pages com sucesso
- [ ] Abertura pública da Home, primeira visita, detalhes dos 5 ministérios e login
- [ ] Navegação e layout conferidos em 390px e 1440px a partir das capturas do pipeline
- [ ] Nenhum link local quebrado ou rota obrigatória ausente no export
- [ ] Fotografias ilustrativas, calendário e atividades fictícias identificados; responsáveis pela igreja aprovam informações publicadas

### Administração real / login operacional (NO-GO até evidências)
- [ ] API HML e Postgres funcionando em HTTPS, /health, /ready, /meta, autorização 401/403
- [ ] Autenticação de pessoas reais, política de sessão/recuperação/MFA e segregação por perfil aprovada
- [ ] Desativar/migrar `useChurchRecords`/localStorage de forma controlada; dados reais **nunca** em armazenamento demonstrativo
- [ ] API autenticada integrada a pessoas, famílias, secretaria, admissões, carteirinhas e auditoria
- [ ] Testes end-to-end com API e DB isolados; cenários de permissão, erro/indisponibilidade, upload e decisão pastoral
- [ ] Política LGPD e privacidade para dados de menores, famílias e informações pastorais
- [ ] Backup/restauração, monitoramento, rollback, plano de suporte e aceite da liderança
- [ ] `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PORTAL_LIVE_ENABLED`, `NEXT_PUBLIC_VOLUNTEER_INTAKE_ENABLED` só com HML/PRD e conteúdos homologados

## Implantação e testes
- Publicação estática: GitHub Pages (não executa NestJS, Prisma ou Postgres).
- Run do merge anterior em `main`: `42271465072` (todos os jobs, incluindo Pages, passaram).
- PR desta consolidação: exigir novamente CI; comparar capturas antes de merge.
- CI em PR não publica Pages; após merge confirmar sucesso do run da `main`.
- Sem novos módulos, migrações, contas reais, dados reais, novas permissões ou inclusão de ferramentas externas no fechamento.

## Próximo marco
**Frontend institucional congelado com QA verificado; iniciar integração FE ↔ BE somente na HML autorizada, sem deixar de marcar claramente os dados sintéticos.** O go-live administrativo terá uma checklist própria.
