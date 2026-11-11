# Liberação do ID Riacho 1

A candidata é testada no portal e na API de homologação, com banco sintético. A publicação de `main` aciona o GitHub Pages, portanto o merge deve ocorrer somente na janela de liberação acordada. No fluxo atual, o build de `main` aponta o login à API HML. Para a liberação real, aponte o build para a API real validada e revise as restrições de cadastro e telas que ainda usam a configuração de homologação.

## Evidências da candidata

- Navegação do portal em cinco larguras, login com credenciais válidas e inválidas, Secretaria, equipe e caixa do Ministério de Homens e Carteirinhas foram verificados no Chromium com API e PostgreSQL isolados.
- O banco de QA tem 21 migrações concluídas e 750 cadastros sintéticos, sendo 400 ativos, 250 inativos e 100 em admissão.
- A auditoria de dependências de produção reportou oito alertas altos e um moderado. A configuração real de armazenamento privado, a recuperação do banco e a API de produção ainda precisam de ensaio no ambiente de destino.

## Ambientes e dados

- Mantenha projetos e credenciais distintos para a API real e para QA. Configure `IDBRF_RUNTIME_STAGE=production`, `PRODUCTION_DATABASE_HOST` e `PRODUCTION_DATABASE_NAME` com o destino real. Use a URL TLS do PostgreSQL e credenciais de execução separadas das de migração.
- Antes do corte, registre o SHA e o histórico de migrações da API candidata. Aplique as migrações primeiro em um banco isolado, com conexão direta. Valide a restauração em um destino isolado e registre tempo, contagens e versão do esquema. Importe dados reais apenas depois desse ensaio. O seed sintético deve permanecer na homologação.
- Configure `PRIVATE_BLOB_READ_WRITE_TOKEN` em um bucket privado separado da biblioteca pública. A API entrega o arquivo após verificar a autorização. Ensaie upload, leitura e remoção a partir de instâncias diferentes, com um arquivo sintético. Arquivos existentes em disco precisam de uma migração explícita, com verificação de hash antes de trocar o armazenamento.
- Defina a origem HTTPS exata do portal em `CORS_ORIGIN` e uma chave de sessão exclusiva para o ambiente real. Verifique HTTPS e cabeçalhos no endereço que o usuário acessa. Configure proteção de borda para login e rotas públicas de escrita. O limitador em memória da aplicação vale apenas para a instância atual.

## Critérios de aceite

1. A API candidata tem SHA conhecido, inicia com configuração válida e responde a `/ready`. Rode `npm run release:preflight` com `IDBRF_PRODUCTION_API_ORIGIN`, `IDBRF_PRODUCTION_WEB_ORIGIN` e `IDBRF_PRODUCTION_API_SHA`. O comando apenas consulta a API e audita dependências.
2. Teste sessão e expiração, acesso por papel, isolamento entre ministérios e operações de cadastro, credencial e caixa. A resposta de login atualmente informa o requisito de MFA sem impedir a emissão de JWT. Conclua a exigência de segundo fator antes de liberar contas privilegiadas.
3. Valide fotos, agenda aprovada, login e os fluxos autenticados no domínio candidato. Se a agenda ainda depender do Instagram, confirme esse comportamento com a equipe antes de ativar a fonte de eventos reais.
4. Registre a restauração do banco, a conferência do armazenamento privado e a política de recuperação de sessão. Confira a auditoria de dependências antes de promover.
5. Na janela de liberação, fixe as versões anteriores do portal e da API. Se falharem o login, a disponibilidade do banco ou o acesso por papel, restaure os artefatos anteriores. Migrações que alteram dados exigem plano próprio de reversão. Confira os mesmos fluxos no endereço público após o corte.

Referências oficiais do provedor: [Vercel Blob privado](https://vercel.com/docs/vercel-blob/private-storage) e [Neon, pooling](https://neon.com/docs/connect/connection-pooling).

## Preparação Hostinger — sem implantação

Esta seção prepara a futura VPS. Ela não implanta nada na Hostinger, não altera DNS e não move o site ou a API que hoje estão em GitHub Pages e Vercel. O comando `npm run release:f11-preflight` não abre rede e termina com NO-GO enquanto MFA de login, revogação de sessão no guarda e a QA independente não estiverem fechados.

- Publique a API atrás de um reverse proxy com TLS. O proxy termina HTTPS e encaminha um único salto para o processo Node. Defina `TRUST_PROXY` com esse número de saltos. Sem esse valor, a API de produção não sobe. O limitador usa o IP que o Express calcula depois dessa confiança e ignora um `X-Forwarded-For` forjado pelo cliente.
- O banco de produção usa usuário de aplicação distinto do usuário de migração, conexão com `sslmode=require` ou `verify-full`, e host/nome conferidos por `PRODUCTION_DATABASE_HOST` e `PRODUCTION_DATABASE_NAME`. A migração F1.1 é aditiva e tem `down.sql`. Ela não foi aplicada em produção nem no Neon de QA. O CI só migra `localhost`.
- A trilha `audit_logs` é append-only por trigger. O papel da aplicação não deve receber `UPDATE` nem `DELETE` nessa tabela. O histórico existente não é reescrito. Backup e ensaio de restauração continuam obrigatórios antes de qualquer dado real: registre tempo, contagem e versão do esquema em um destino isolado.
- Segredos ficam no ambiente da VPS, um conjunto por DEV, HML e produção. Não reutilize o token do armazenamento público no bucket privado. Gire `JWT_SECRET` com invalidação das sessões. `F11_MFA_BLOCKING=true` é obrigatório em produção; fora dela a flag fica desligada para não trancar a massa sintética.
- `CORS_ORIGIN` lista só origens HTTPS do portal. A API envia `nosniff`, `DENY` de frame, `no-referrer`, CSP `default-src 'none'` e, em produção, HSTS. `/health` e `/ready` continuam sem detalhes de banco. Métricas mínimas ficam no processo; não há serviço externo contratado.
- Logs vão para stdout, com rotação no sistema da VPS. O identificador `X-Request-Id` correlaciona a resposta e a auditoria. Corpo, cookie, senha, token e documento não entram no evento.
- O limitador em memória vale para uma instância. Com mais de uma instância, `RATE_LIMIT_STORE=shared` usa a tabela `rate_limit_buckets`. Se esse store falhar, a rota limitada responde 429. Redis não é exigido.
- Antes do corte, restaure um backup de ensaio, suba a versão anterior da API e do portal se login, banco ou papel falharem, e aplique `down.sql` só se a migração F1.1 tiver sido a única mudança de esquema dessa janela e houver backup restaurável. Não declare a fase pronta para produção enquanto o status em `docs/f11-integracao-status.md` for NO-GO.
