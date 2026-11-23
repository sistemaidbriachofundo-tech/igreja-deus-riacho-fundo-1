# ID Riacho 1 — aplicativo Android e iOS (fundação DEV)

Este diretório **não substitui o site**. Ele prepara a aplicação React/Next.js já existente para Android e iPhone via Capacitor. Foi mantido **fora** do padrão de workspaces `apps/*` para não alterar o `package-lock.json`, os builds e o deploy atuais do site.

> **Status:** estrutura inicial para desenvolvimento/revisão, **não** binário pronto para lojas. Não publicar nem conectar a produção sem testes no DEV e homologação aprovados.

## Stack

- Web compartilhada: Next.js 15 + React 19 + TypeScript, com `output: "export"`.
- Mobile: Capacitor 8 (Node.js 22+), com projetos Android/iOS gerados pelo CLI.
- API e banco: os **mesmos** da aplicação existente; não duplicar a base.
- Identificador **proposto**, sujeito a aprovação antes do registro nas lojas: `br.com.igrejadeusrf1.app`.
- Idioma inicial: português do Brasil; internacionalização só quando for necessária (não criar conteúdo inventado).

## Primeira execução em DEV

1. Instalar dependências da raiz do repositório conforme o lock existente: `npm ci`.
2. Configurar **API de testes** via `NEXT_PUBLIC_API_URL` com URL HTTPS real do ambiente DEV/HML, **não** a API de produção. Verificar flags existentes em `apps/web/src/lib/admin-environment.ts`.
3. Gerar o export estático do site **sem** o prefixo do GitHub Pages:

   ```bash
   IDBRF_STATIC_APEX=1 NEXT_PUBLIC_BASE_PATH='' NEXT_PUBLIC_HML_ENABLED=true npm run build -w @idbrf/web
   ```

   Atenção: fornecer `NEXT_PUBLIC_API_URL` no mesmo processo (por exemplo via variável exportada no shell). **Não executar contra o banco de produção.** Confirmar que o build gerou `apps/web/out/index.html`.

4. Instalar dependências móveis: `cd mobile && npm install` (gerar e versionar um `package-lock.json` móvel após resolver versões).
5. Adicionar a plataforma nativa, uma vez: `npm run native:android` e/ou `npm run native:ios` (iOS exige macOS/Xcode).
6. Sincronizar: `npm run sync`, abrir: `npm run open:android` ou `npm run open:ios`.
7. Versionar os projetos `mobile/android` e `mobile/ios` depois de gerados e revisados.

## Bloqueios de integração antes de liberar teste real

1. **CORS**: API NestJS exige `CORS_ORIGIN`. Validar origens do Capacitor `capacitor://localhost` no iOS e `http://localhost` no Android, exclusivamente nas APIs autorizadas para o ambiente de teste, sem `*` em produção.
2. **Autenticação**: login e MFA, expiração de token, logout, recuperação de senha, armazenamento seguro de tokens e retomada do evento após login. Auditar links externos para não perder a navegação.
3. **Recursos nativos**: push com consentimento (APNs/FCM), QR de check-in via câmera, permissões por perfil, leitura de PDF, downloads, compartilhamento e links profundos para eventos.
4. **Segurança/LGPD**: política de privacidade, solicitação de exclusão da conta dentro do app e na web, acesso mínimo aos dados, tratamento especial de dados de menores e informações pastorais.
5. **Lojas**: ícones, telas de inicialização, screenshots, descrição, classificação etária, contato de suporte, contas de teste das lojas e assinaturas; Android requer AAB assinado e iOS requer archive/IPA assinado e TestFlight.
6. **Pagamentos**: inscrições presenciais podem usar checkout externo compatível com as políticas das lojas, mas ofertas/doações devem ser validadas separadamente antes da liberação no iOS.
7. **Ambientes**: builds `DEV -> HML -> produção` com APIs separadas. O pacote desta branch **não realiza qualquer publicação automática**.

## O que esta branch entrega

- Configuração inicial do Capacitor e scripts de CLI.
- Verificação da existência do export web e proteção contra assets com prefixo do GitHub Pages.
- Documentação da estratégia e pendências reais.

**Não inclui** código nativo gerado, APK/AAB/IPA assinado, push operacional ou aprovação nas lojas. Esses itens dependem de compilação, dispositivos de teste, credenciais das lojas e integração da API.
