# Handoff — Portal público Church OS 2026 (frontend PR #37)

> Documento de integração FE↔BE, sem alterar o contrato F2/F3 existente nem criar endpoints de produção.
> Contexto: DAS v1.1 / backend NestJS+Prisma (PRs #30, #35) / frontend administrativo PR #36.
> Status deste PR: somente frontend estático e conteúdo ilustrativo.

## Produto e rotas públicas

O visitante entra no portal institucional; `/app/` permanece exclusivamente o espaço administrativo/demonstração.

- `/`: Home institucional, ministérios em destaque e agenda ilustrativa
- `/a-igreja/`: institucional
- `/ministerios/`: hub dos cinco ministérios
- `/ministerios/jovens/`, `homens/`, `adolescentes/`, `mulheres/`, `atmosfera/`: páginas ministeriais
- `/eventos/`: agenda
- `/contato/`: canais oficiais sem formulário que recolha dados
- `/app/`: Church OS administrativo existente — NÃO alterado

O Atmosfera é o voluntariado da congregação. Não confundir com a seção editorial de adoração.

## Fonte atual e futura

Hoje `apps/web/src/lib/portal-content.ts` oferece `ministries`, `events`, `getMinistry` com dados de demonstração.
Os itens fictícios estão rotulados no portal; não divulgar datas/horários como eventos reais.

Substituição planejada por consulta à API NestJS com **somente dados publicados**:
- `GET /public/home`: hero, destaques, institucional e referências a eventos
- `GET /public/ministries`: ministérios listáveis
- `GET /public/ministries/:slug`: página pública individual
- `GET /public/events`: lista de eventos publicados
- `GET /public/events/:slug`: detalhes de evento quando F4 estiver pronto
- `GET /public/content/:slug`: páginas de conteúdo quando o CMS F5 estiver pronto

Esses caminhos são **propostos**, não representados como já implementados. Evitar mudanças incompatíveis em `/ministries`, `/rosters`, `/memberships` e demais endpoints existentes.

## Shape mínimo que o frontend consome

```ts
type MinistryPublic = {
  slug: "jovens" | "homens" | "adolescentes" | "mulheres" | "atmosfera";
  name: string;
  eyebrow: string;
  headline: string;
  summary: string;
  purpose: string;
  image: string; // URL pública permitida, sem documentos privados
  imageAlt: string;
  tone: "gold" | "clay" | "olive" | "rose" | "night";
  pillars: { title: string; description: string }[];
  invitation: string;
};

type EventPublic = {
  id: string;
  day: string;
  month: string;
  date: string; // ISO yyyy-mm-dd
  time: string; // exibição
  title: string;
  category: string;
  ministry: "jovens" | "homens" | "adolescentes" | "mulheres" | "atmosfera" | "igreja";
  description: string;
  image: string;
};
```

Os valores acima refletem o modelo de visualização atual, **não** a proposta obrigatória de tabela Prisma. A API pode usar DTOs normalizados e o frontend adapta os dados.
O backend deve preservar timestamps ISO com timezone explícito e uma projeção adequada ao fuso da igreja.

## Regras da integração

1. Reutilizar `Ministry` existente (F3). Não duplicar entidade, identidade de pessoas nem motor de escalas.
2. Na API pública, retornar somente o subconjunto marcado como `PUBLISHED`. Nada de usuários, telefone, endereços pessoais, prontuário pastoral, documentos ou registros de menores.
3. Gestão de edição/publicação depende de autenticação, papel, **escopo da igreja e do ministério**, e auditoria.
4. Solicitação de voluntariado deve ter endpoint próprio com validação, consentimento, rate limiting e triagem, quando o BE entregar o contrato.
5. F4 inicia com agenda/eventos; inscrições, pagamento e check-in ficam para etapa específica.
6. F5 inicia com conteúdo institucional e publicação; IA, WhatsApp e outros canais permanecem fora deste PR.
7. A versão estática não depende de backend. Enquanto HML não existir, todas as páginas continuam renderizáveis sem dados privados.

## Consideração de hospedagem

O Next.js está em `output: "export"` para GitHub Pages, sem API server-side nem ISR.
Para conteúdo atualizado, escolher explicitamente entre:
- rebuild do site ao publicar conteúdo (recomendado para páginas indexáveis); ou
- busca client-side na API pública HML/PRD com fallback e estados de erro.

Para adicionar novos `slug`s a `/ministerios/[slug]/`, o export estático precisa gerar a rota correspondente em build.
Não inserir `NEXT_PUBLIC_API_URL` real antes de ter HTTPS/CORS e homologação aprovada.

## Handoff do BE para FE

Ao finalizar cada endpoint, enviar:
- OpenAPI atualizado e exemplos JSON de sucesso/erro
- ambientes/URL HTTPS de HML e políticas CORS
- entidades publicáveis e transições editoriais
- paginação, filtros, ordenação e media URLs
- permissão e escopo para editores ministeriais
- testes de publicação, despublicação e isolamento de dados

## Critérios de revisão deste PR

- Lint, typecheck, test, build, SonarCloud aprovados.
- Export contém as cinco rotas ministeriais, agenda e páginas institucionais.
- Links e assets internos válidos (script `apps/web/scripts/verify-export.mjs`).
- Revisão visual em desktop 1440 px, tablet 768 px e mobile 390 px antes do merge.
- Dados e eventos fictícios identificados.
- `/app/` administrativo preservado.
