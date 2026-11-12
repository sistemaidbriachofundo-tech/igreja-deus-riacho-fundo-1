# Entrega técnica — Ficha 360 + Inteligência de Membresia (RF1)

**Status:** branch isolada de revisão, sem merge/deploy. Base: `previa/rf1-v1`. 
Referências visuais: `Ficha igreja(1).pdf` (página 1) e `Dash(1).pdf` (páginas 1–4).

## Escopo codificado
- **Ficha 360:** mantém edição/consulta/histórico/família/foto já existentes, com novo cabeçalho
  institucional e indicador acessível de dados essenciais (nome, e-mail, endereço, nascimento).
  Não modifica o contrato PATCH nem altera a política de permissões.
- **Dashboard:** `/app/secretaria/indicadores/`. Estatísticas da congregação, sexo,
  situação de membresia, faixa etária, tempo desde primeira frequência,
  tempo como membro, registros recentes, aniversários de nascimento,
  casamento e batismo, variação mensal/anual de entradas e encerramentos,
  transferências concluídas, CSV e impressão/PDF pelo navegador.
- **API:** `GET /reports/membership-insights?from=AAAA-MM-DD&to=AAAA-MM-DD`.
  Fonte: PostgreSQL via Prisma. `@Roles` + verificação de grants/igreja
  existente em `assertMembershipAccess`.
- **Navegação:** links no resumo administrativo e na área Relatórios.

## O que o usuário vê
As cores seguem os tokens e valores já existentes da interface do Riacho
(verde, bronze/dourado e off-white); tipografia Inter/Montserrat; responsivo
com grade adaptada de 4 para 2 e 1 coluna, charts SVG acessíveis e
estado de carregamento/vazio/401/403/falha sem números inventados.

## Interpretação correta
- Estado atual (ativos/inativos) **não equivale** a uma série histórica de ativos.
- O gráfico mensal/anual apresenta **datas de início e fim de vínculos** que
  estão salvas no banco, não um saldo oficial reconstituído.
- Variação de transferências refere-se a transferências **concluídas** no período.
- Indicadores sem informação não entram automaticamente como zero.
- Idade, sexo e tempo consideram vínculos ativos; sem data vai para o grupo
  "sem informação".
- Lista nominal de comemorações e cadastros **exclui menores**.
- Data de referência de aniversários: fuso America/Sao_Paulo.
- A função de CSV neutraliza injeção de fórmulas e contém agregados, sem lista
  nominal exportada.

## Como validar
1. Abrir `Actions → QA isolada — Ficha 360 e Membresia` na branch desta entrega.
2. Aprovar apenas após typecheck da API/web, testes Jest/Vitest e build Next.
3. Conectar a API desta branch a uma instância QA de banco sintético autorizada,
   **nunca ao Neon produção**. A tela só carrega com `NEXT_PUBLIC_HML_ENABLED=true`
   e API `NEXT_PUBLIC_API_URL` configurada, após login autorizado.
4. Verificar papéis SECRETARIA/PASTOR/PLATFORM_ADMIN com 200 e sem sessão ou
   papéis não autorizados com 401/403.
5. Validar grafos com as 750 membresias sintéticas do Work e ausência de PII
   em resposta de API/CSV; testar datas limítrofes, fevereiro e mobile.
6. Realizar revisão visual e funcional do Work antes de integrar ao PR #178.

## Limites da entrega
- Não houve migração de banco, instalação na VPS, alteração de DNS,
  deploy na Hostinger/Vercel ou troca da produção.
- O método de PDF é impressão do navegador ("Salvar como PDF"), não
  geração de arquivo PDF no servidor.
- O fluxo de edição, anexos e histórico completo já existente na Ficha 360
  foi reaproveitado, não substituído nem duplicado.
- Não foram adicionadas novas migrations ou colunas de banco.
- Testes de navegação com API real e aceite visual de homologação
  permanecem como gate antes de promover a produção.
