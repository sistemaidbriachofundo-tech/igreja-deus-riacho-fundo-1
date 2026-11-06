# Galeria editorial V10 — imagens enviadas pelo responsável

## Origem e uso
Quatro imagens ilustrativas enviadas pelo responsável pela Igreja de Deus Riacho Fundo I em 2026-11-06. São composições/gerações visuais, não fotografias verificadas de cultos ou conferências reais. A arte de palco contém o texto **CONF2K26**, que não deve ser anunciado como evento oficial sem confirmação editorial.

## A publicação
- Componente `PortalFaithGallery` na Home, entre os ministérios e o Atmosfera.
- Galeria acessível com quatro descrições alternativas: louvor, juventude, oração e Palavra.
- Quatro arquivos WebP otimizados (`public/images/galeria-*.webp`) gerados das quatro imagens do usuário. Publicados dentro do repositório, com carregamento lazy, dimensões explícitas e texto alternativo.
- Aviso visível de imagens ilustrativas.
- A montagem original de alta resolução fica com o responsável; a miniatura otimizada é para a galeria.
- Aplicar a mesma direção artística à aba de Mídia apenas quando existir upload seguro, permissões, metadados e storage persistente.

## Lacunas perante o WordPress
Prioridade 1: biblioteca de mídia com upload seguro, busca, licença, texto alternativo, recorte e derivados responsivos.
Prioridade 1: editor de páginas e seções no painel, com pré-visualização e fluxo rascunho → aprovação → publicação.
Prioridade 1: interface de histórico, comparação e restauração de revisões. O backend já registra revisões de CMS, mas a experiência editorial de consulta/rollback visual ainda precisa ser construída.
Prioridade 2: SEO por página (title, description, imagem social, sitemap e redirecionamentos), permissões editoriais.
Prioridade 2: agendamento automático de publicação (a data dos eventos já existe, mas isso não agenda a publicação), busca pública e formulários conectados em produção.
Prioridade 3: análises de tráfego, consentimento quando aplicável, integrações e extensões bem governadas.

Não instalar WordPress nem copiar seu ecossistema de plugins: aproveitar o backend NestJS, o frontend Next e o CMS existente, acrescentando as funções de edição que faltam com segurança.
