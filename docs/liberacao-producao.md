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
