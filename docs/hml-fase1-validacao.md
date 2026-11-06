# ID Riacho 1 — Homologação Fase 1

## Escopo fechado
- **Banco isolado:** Neon `id-riacho-1-homologacao-fase-1` (nenhum dado de Kairos/ONE/produção).
- **API HML:** NestJS `apps/api` em um projeto Vercel dedicado e protegido.
- **Frontend HML:** as rotas existentes `/app/`, `/app/membros/`, `/app/secretaria/`, `/app/membros/carteirinha/` alternam para `HmlPhaseOne` quando `NEXT_PUBLIC_HML_ENABLED=true`; com flag desativada, a versão pública continua demonstrativa sem API.
- **Editorial:** mantém `EditorialStudio` autenticado com `NEXT_PUBLIC_API_URL`.
- **Dados:** seeds anteriores + 52 pessoas, 15 famílias, 12 processos pendentes, 25 membros ativos, 10 visitantes e 5 inativos totalmente fictícios; e-mails usam `example.test`. IDs específicos e upserts não sobrescrevem alterações durante testes.

## Controles
- Login real por JWT e papéis (secretaria, pastor, membro); ações somente pelas APIs Nest existentes.
- Criar protocolo usa `POST /admissions` e transação do backend; decisões seguem etapas e permissões.
- Carteirinhas usam `POST /credentials/issue/:membershipId` e `/revoke/:credentialId`.
- Não habilitar PDF/documentos com storage efêmero; esses fluxos exigem objeto persistente e teste de recuperação.
- Senha de HML por `HML_DEMO_PASSWORD_HASH` secret, nunca por hash da senha demo fixa em produção.
- UI de HML não aparece no GitHub Pages sem a feature flag; zero dados oficiais.

## Testes
```bash
# HML protegida e preparada com DB, migrate e seed
API_BASE=https://id-riacho1-api-hml.exemplo.vercel.app \
HML_DEMO_PASSWORD=\"<senha privada>\" node scripts/hml/fase1-e2e.mjs

# Caso queira testar escrita de registros fictícios:
ALLOW_HML_WRITE_TESTS=yes API_BASE=... HML_DEMO_PASSWORD=... node scripts/hml/fase1-e2e.mjs
```

## Gate para validação
- [ ] Deploy da API confirmado, `GET /ready = 200`
- [ ] Migrações e seed executados apenas na Neon HML
- [ ] Smoke `fase1-e2e.mjs` aprovado (401, 403, leitura e escrita sintética)
- [ ] Frontend HML conectado a mesma API com URL estável e CORS correto
- [ ] Capturas 390px/1440px, navegação e erros/estados vazios testados
- [ ] Retenção, backup, storage privado e autenticação reforçada antes de dados reais
- [ ] Aceite formal da liderança para operações reais

O Portal Pages permanece estático e não opera como banco de produção.
