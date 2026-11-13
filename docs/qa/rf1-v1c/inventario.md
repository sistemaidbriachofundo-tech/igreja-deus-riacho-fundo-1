# Inventário de rotas e código — baseline 6c43aea

Leitura estática do SHA publicado. Nada foi apagado. A exclusão fica com o integrador, depois deste mapa.

O build de `main` liga `NEXT_PUBLIC_HML_ENABLED` e `NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED`. Por isso o Pages oficial monta o ramo HML e o chat público. O workflow de CI não é editado nesta frente.

## Rotas

| Rota | Classe | Arquivo | Nota |
|---|---|---|---|
| `/` | ROTA_PUBLICA_DO_ROTEIRO | `apps/web/src/app/page.tsx` | Permanece no menu ou no acesso. A diretriz pede Início, Quem somos e Agenda na mesma página. |
| `/a-igreja/` | ROTA_PUBLICA_DO_ROTEIRO | `apps/web/src/app/a-igreja/page.tsx` | Permanece no menu ou no acesso. A diretriz pede Início, Quem somos e Agenda na mesma página. |
| `/app/` | ROTA_AUTENTICADA | `apps/web/src/app/app/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/demo/` | ROTA_RETIRADA | `apps/web/src/app/app/demo/page.tsx` | A página avisa que o cadastro local foi retirado, mas a URL continua publicada. |
| `/app/editorial/` | ROTA_AUTENTICADA | `apps/web/src/app/app/editorial/page.tsx` | Estúdio real de conteúdo. O título ainda usa Church OS. |
| `/app/eventos-gestao/` | ROTA_AUTENTICADA | `apps/web/src/app/app/eventos-gestao/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/membros/` | ROTA_AUTENTICADA | `apps/web/src/app/app/membros/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/membros/carteirinha/` | ROTA_AUTENTICADA | `apps/web/src/app/app/membros/carteirinha/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/ministerios/` | ROTA_AUTENTICADA | `apps/web/src/app/app/ministerios/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/operacao/` | SUPERFICIE_REJEITADA | `apps/web/src/app/app/operacao/page.tsx` | Rótulo e módulo genérico Ministérios e operação / DAS, com fases F2–F6. |
| `/app/relatorios/` | ROTA_AUTENTICADA | `apps/web/src/app/app/relatorios/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/secretaria/` | ROTA_AUTENTICADA | `apps/web/src/app/app/secretaria/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/servir/atmosfera/` | ROTA_AUTENTICADA | `apps/web/src/app/app/servir/atmosfera/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/servir/louvor/` | ROTA_AUTENTICADA | `apps/web/src/app/app/servir/louvor/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/servir/meu-espaco/` | ROTA_AUTENTICADA | `apps/web/src/app/app/servir/meu-espaco/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/app/site/` | ROTA_AUTENTICADA | `apps/web/src/app/app/site/page.tsx` | Gestão do site. Conserva o assistente editorial interno. |
| `/app/tesouraria/` | ROTA_AUTENTICADA | `apps/web/src/app/app/tesouraria/page.tsx` | Área interna. O build de main usa o ramo HML quando a flag está ligada. |
| `/contato/` | ROTA_PUBLICA_FORA_DO_ROTEIRO | `apps/web/src/app/contato/page.tsx` | Página pública além do trio Início / Quem somos / Agenda. |
| `/design-system/` | FERRAMENTA_ENGENHARIA | `apps/web/src/app/design-system/page.tsx` | Vitrine do kit visual, fora do roteiro público Início / Quem somos / Agenda. |
| `/eventos/` | ROTA_PUBLICA_DO_ROTEIRO | `apps/web/src/app/eventos/page.tsx` | Permanece no menu ou no acesso. A diretriz pede Início, Quem somos e Agenda na mesma página. |
| `/login/` | ROTA_PUBLICA_DO_ROTEIRO | `apps/web/src/app/login/page.tsx` | Permanece no menu ou no acesso. A diretriz pede Início, Quem somos e Agenda na mesma página. |
| `/ministerios/` | ROTA_PUBLICA_FORA_DO_ROTEIRO | `apps/web/src/app/ministerios/page.tsx` | Página pública além do trio Início / Quem somos / Agenda. |
| `/ministerios/[slug]/` | ROTA_PUBLICA_FORA_DO_ROTEIRO | `apps/web/src/app/ministerios/[slug]/page.tsx` | Página pública além do trio Início / Quem somos / Agenda. |
| `/novidades/` | ROTA_PUBLICA_FORA_DO_ROTEIRO | `apps/web/src/app/novidades/page.tsx` | Página pública além do trio Início / Quem somos / Agenda. |
| `/status/` | FERRAMENTA_ENGENHARIA | `apps/web/src/app/status/page.tsx` | Página de bootstrap com checklist de CI, Sonar e localhost. |
| `/visita/` | ROTA_PUBLICA_FORA_DO_ROTEIRO | `apps/web/src/app/visita/page.tsx` | Página pública além do trio Início / Quem somos / Agenda. |
| `/w1-estudio/` | EDITOR_SIMULADO | `apps/web/src/app/w1-estudio/page.tsx` | Estúdio com papel e publicação simulados, publicado no Pages oficial. |

## Componentes vigiados

| Arquivo | Classe | Quem importa |
|---|---|---|
| `apps/web/src/components/RiachinhoPublicChat.tsx` | ASSISTENTE_PUBLICO | apps/web/src/components/PublicPortal.tsx, apps/web/src/components/ViviEditorialAssistant.tsx |
| `apps/web/src/components/ViviEditorialAssistant.tsx` | ASSISTENTE_INTERNO | apps/web/src/components/SiteManager.tsx |
| `apps/web/src/w1-portal/W1PortalStudio.tsx` | EDITOR_SIMULADO | apps/web/src/app/w1-estudio/page.tsx |
| `apps/web/src/components/MemberDirectory.tsx` | FALLBACK_LOCAL | apps/web/src/app/app/membros/page.tsx |
| `apps/web/src/components/ChurchSecretary.tsx` | FALLBACK_LOCAL | apps/web/src/app/app/secretaria/page.tsx |
| `apps/web/src/components/ChurchDashboard.tsx` | FALLBACK_LOCAL | apps/web/src/app/app/page.tsx |
| `apps/web/src/components/DasOperations.tsx` | SUPERFICIE_REJEITADA | apps/web/src/app/app/operacao/page.tsx |
| `apps/web/src/components/HmlPhaseOne.tsx` | ATIVA_NO_BUILD_HML | apps/web/src/app/app/membros/page.tsx, apps/web/src/app/app/secretaria/page.tsx |
| `apps/web/src/components/PersonaHome.tsx` | ATIVA_NO_BUILD_HML | apps/web/src/app/app/page.tsx, apps/web/src/components/HmlPhaseOne.tsx |
| `apps/web/src/components/EditorialStudio.tsx` | ROTA_AUTENTICADA | apps/web/src/app/app/editorial/page.tsx |
| `apps/web/src/components/SiteManager.tsx` | ROTA_AUTENTICADA | apps/web/src/app/app/site/page.tsx |
| `apps/web/src/lib/use-church-records.ts` | FALLBACK_LOCAL | apps/web/src/components/ChurchDashboard.tsx, apps/web/src/components/ChurchSecretary.tsx, apps/web/src/components/MemberDirectory.tsx |

## Scripts e flag

| Arquivo | Classe | Nota |
|---|---|---|
| `apps/web/scripts/synthetic-auth-stub.mjs` | FERRAMENTA_LOCAL | Servidor de QA em loopback. Não é rota do Pages. |
| `apps/web/scripts/synthetic-auth-policy.mjs` | FERRAMENTA_LOCAL | Política do stub local. Não entra no site publicado. |
| `apps/web/scripts/verify-export.mjs` | ATIVO_BUILD | Conferência do export estático. Não remover junto com o código morto. |
| `.github/workflows/ci.yml` | FLAG_DE_BUILD | No push da main liga o chat público e o modo HML. Fora do ownership desta frente. |

## Sinais para não apagar no escuro

- RiachinhoPublicChat ainda é montado pelo portal público.
- ViviEditorialAssistant permanece em SiteManager e deve ser preservado.
- use-church-records.ts ainda grava a base ilustrativa em localStorage. MemberDirectory, ChurchSecretary e ChurchDashboard são o ramo falso do build HML; testes de produto ainda citam esses arquivos.
- W1PortalStudio ainda oferece papel simulado e publicação simulada.
- O menu ainda tem o rótulo Ministérios e operação.
- Meu Espaço usa OWN_ASSIGNMENT, que inclui papéis administrativos.
- HmlPhaseOne traduz qualquer 409 para a mesma frase.
