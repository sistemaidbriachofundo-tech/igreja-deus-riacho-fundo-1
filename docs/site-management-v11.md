# ID Riacho 1 — Gestão autônoma do portal (V11)

**Objetivo:** membros autorizados da equipe operarem o portal sem desenvolvedor, edição de código ou agente de IA no dia a dia. Não é migração para WordPress.

## Primeira entrega — Central de Gestão do Site

Rota administrativa `/app/site/` no mesmo design do ID Riacho 1:

- Autenticação existente da API NestJS, papéis `SECRETARIA`, `PASTOR` ou `PLATFORM_ADMIN`, com verificação do escopo da igreja piloto no servidor.
- Edição de título, destaque, introdução e imagem da Home; título/legendas das quatro fotografias e textos alternativos.
- Seletor de biblioteca **curada** de imagens já existentes no projeto (sem precisar de GitHub) e opção de URL HTTPS autorizada.
- Três paletas aprovadas (`dourado`, `verde`, `marfim`), preservando tipografia, identidade e elementos críticos.
- Subir/descer, mostrar/ocultar seções existentes, mantendo o convite final.
- Prévia de textos, fotos, paleta e ordem no computador e no celular (não é um iframe da Home inteira).
- Salvar rascunho sem alterar a versão publicada.
- Publicar explicitamente com confirmação, com trilha de auditoria e revisão.
- Histórico das 25 publicações mais recentes; restaurar versão antiga para **rascunho**, sem republicar por engano.
- Controle de edição concorrente por `expectedUpdatedAt`: conflito HTTP 409 quando outro editor salvou.

## Armazenamento e segurança

Reutiliza `CmsContent` e `CmsContentRevision` do PostgreSQL já existente — **sem novas migrações**. Usa dois registros reservados, separados por igreja:

- `idriacho-home-editor-draft`: rascunho, status RASCUNHO.
- `idriacho-home-editor-live`: publicação aprovada, status PUBLICADO.

O CMS genérico bloqueia alteração desses dois identificadores, evitando publicar por rotas alternativas. Mudanças são validadas contra formato fechado, imagens HTTPS ou da biblioteca local, limites de tamanho, ordem completa sem duplicatas e apenas paletas permitidas. O endpoint público `GET /public/site-layout` retorna **somente o registro publicado** ou `layout:null`; não expõe dados administrativos, tokens nem rascunhos. As mudanças ficam auditadas.

## Publicação sem intervenção da TI

Após habilitar **uma vez** `NEXT_PUBLIC_SITE_LAYOUT_LIVE_ENABLED=true` no build do frontend e configurar `NEXT_PUBLIC_API_URL` com a API pública segura, o site lê a versão publicada no navegador (cache no-store). A atualização passa a ocorrer sem novo commit, deploy manual ou ajuda de TI. Sem essa configuração, a versão atual da Home permanece intacta, como fallback.

A página institucional em GitHub Pages continuará servindo arquivos estáticos, mas buscará **somente** conteúdo público aprovado, pela API HTTPS. **Não ligar isso diretamente à base de testes HML no site oficial** antes de aprovar textos e fotos reais.

## Roteiro para homologação

1. Entre na HML da Vercel e acesse `/app/site/` com uma conta fictícia autorizada.
2. Abra `Fotos` e escolha uma imagem. Em `Textos`, altere o título e a legenda.
3. Alterne a prévia Computador/Celular. Escolha outra paleta.
4. Em `Estrutura`, oculte a seção de vídeos e mova a galeria; confira a prévia.
5. Salve o rascunho e valide que o endpoint público **não mudou**.
6. Publique e valide que `GET /public/site-layout` retorna somente a configuração aprovada.
7. Abra a Home HML com `NEXT_PUBLIC_SITE_LAYOUT_LIVE_ENABLED=true`; recarregue e confira alterações de texto, foto, cores, ordem e visibilidade.
8. Restaure uma versão anterior pelo Histórico e confirme que a versão pública **não mudou** sem nova publicação.
9. Tente salvar simultaneamente com duas sessões: a versão antiga deve receber 409.
10. Um usuário `MEMBRO` não deve conseguir ler/editar o painel.

## Limites da entrega — NÃO confundir com CMS WordPress completo

- **Upload direto de fotos novas:** requer provisionar armazenamento público de mídia persistente, com limite de tamanho, validação de arquivos, otimização, consentimento e metadados. Ainda não está implementado. O editor já permite **reutilizar fotos existentes sem TI**.
- **Novas páginas/blocos arbitrários, menu, rodapé, SEO por página e publicação agendada:** próximos módulos; a V11 reorganiza apenas seções existentes da Home.
- A recuperação traz uma versão anterior para o rascunho, não desfaz uma publicação imediatamente.
- O editor não altera tabelas de membros, famílias, saúde, finanças nem documentos.

**Critério de aceite da V11:** editor autorizado consegue alterar, pré-visualizar, salvar, publicar e recuperar a Home, sem acesso a código, e os dados sintéticos de HML não aparecem no site oficial.
