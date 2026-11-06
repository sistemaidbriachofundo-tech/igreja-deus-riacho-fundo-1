# ID Riacho 1 — V12: fechar primeira entrega do editor autônomo

## Escopo realizado
O editor da Home (`/app/site/`) permanece conectado à mesma API NestJS e ao mesmo PostgreSQL do CMS V11. Não foi criado outro banco.

### Mídia pública — upload sem TI
- API `GET /cms/site-media`: lista fotografias do armazenamento público persistente por igreja (primeiras 100).
- API `POST /cms/site-media`: recebe multipart/form-data `file`, faz autorização por perfil e valida assinatura de imagem (JPG/PNG/WebP/AVIF), tamanho máximo de 3 MB e nome sanitizado.
- Armazenamento: Vercel Blob **público**, com token somente no backend e prefixo `church/{churchId}/site`; nenhum documento pessoal deve ser enviado. O Vercel Blob store de homologação `id-riacho1-midia-hml` está conectado apenas à API HML (região São Paulo).
- Frontend: aba Fotos permite selecionar onde aplicar, enviar imagem e utilizar fotos existentes. A foto escolhida marca o formulário como alterado; é necessário **Salvar rascunho** e depois **Publicar**.
- O sistema guarda a URL da foto publicada no CMS como parte da versão da página; arquivos nunca são enviados para o GitHub.

### Permissões editoriais
- `EDITOR_SITE`: pode criar rascunhos e enviar imagens; não publica.
- `PUBLICADOR_SITE`: pode editar e publicar.
- `SECRETARIA`: edição e mídia; publicação exige aprovador separado.
- `PASTOR` e `PLATFORM_ADMIN`: edição e publicação.
- `MEMBRO`: sem acesso ao editor nem à biblioteca.
- Os papéis passam a existir no seed; a atribuição de novos acessos ainda depende de gestão de usuários autorizada (não conceder privilégios automaticamente).
- O backend verifica escopo de organização/congregação e devolve `permissions.canPublish`; o frontend mostra o bloqueio antes de tentar publicar.

### Vivi — IA já existente no backend
- IA do PR #55, sem instalar segundo modelo/serviço: `GET /vivi/status` e `POST /vivi/chat` com JWT.
- Aba `Vivi IA`: sugestões opcionais para textos públicos; não coleta cadastros, não lê banco e não publica por conta própria.
- Consentimento editorial explícito de que o texto não contém dados pessoais.
- Na HML, `/vivi/status` retornou `provider=mock` em 2026-11-06: a UI **não finge IA real** e só habilita geração ao constatar Manus/Gemini configurado **no servidor**. Não guardar chaves no frontend, Git, prompts nem variáveis `NEXT_PUBLIC_*`.
- O prompt do backend orienta redação institucional sem inventar dados pastorais, horários ou eventos. Toda sugestão exige revisão humana.

## Recursos e configuração
- Reutiliza `CmsContent`, `CmsContentRevision` e trilha de auditoria do PostgreSQL.
- Biblioteca HML usa o token `BLOB_READ_WRITE_TOKEN` gerenciado por integração Vercel; nunca exibir o valor.
- `NEXT_PUBLIC_SITE_LAYOUT_LIVE_ENABLED=true` somente na HML; portal institucional **não deve** apontar para a base HML.
- `NEXT_PUBLIC_API_URL` da HML indica a API homologada.
- O armazenamento é público: apenas fotos autorizadas para divulgação devem ser enviadas.

## Homologação funcional obrigatória
1. Entrar no editor HML com papel `SECRETARIA`. Mudar título/foto; salvar rascunho; confirmar que `GET /public/site-layout` não mudou.
2. Selecionar a foto 1 da galeria, enviar JPG/PNG com menos de 3MB e verificar que aparece na lista depois de recarregar.
3. Fazer login como `PASTOR`; publicar a versão salva. Recarregar Home HML em desktop e celular e conferir nova foto e texto.
4. Confirmar que editor/secretaria não consegue publicar (`403`), nem `MEMBRO` consegue usar o painel (`403`).
5. Restaurar uma revisão para rascunho; versão pública permanece intacta até nova publicação.
6. Simular erro de arquivo inválido, arquivo maior que 3MB, token ausente e conflito de edição. Nada deve ser publicado por acidente.
7. Abrir a aba Vivi, confirmar aviso `modo de simulação` se `provider=mock`. Com provedor real configurado, testar apenas textos **públicos sintéticos**, conferir que a sugestão não altera campos sozinha.

## Limites e próximos incrementos
A primeira entrega do editor opera a Home existente, não páginas inteiramente livres. Ainda faltam: aprovação em duas etapas para novos conteúdos, administração de concessão de perfis pela interface, SEO de página, menus/rodapés e biblioteca multimídia com deleção, filtros/paginação avançada e moderação de permissões de imagens. Não confundir implantação de código com aceite completo das jornadas.
