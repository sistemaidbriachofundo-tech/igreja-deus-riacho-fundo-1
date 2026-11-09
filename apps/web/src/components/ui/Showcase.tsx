"use client";

import { useState } from "react";
import { withBasePath } from "../../lib/paths";
import { Button } from "./Button";
import { Card } from "./Card";
import { DashboardSample } from "./DashboardSample";
import { ErrorState } from "./Error";
import { Input } from "./Input";
import { Loading } from "./Loading";
import styles from "./ui.module.css";
import { contrastRatio, dsApprovedPairs, dsColor, dsRejectedPairs } from "./tokens";

const SWATCHES = [
  { name: "Creme", hex: dsColor.cream, note: "Fundo de acolhimento. Texto em marrom." },
  { name: "Marrom", hex: dsColor.brown, note: "Instituição, títulos e foco em superfície clara." },
  { name: "Ouro", hex: dsColor.gold, note: "Ação e selo. Texto marrom sobre o ouro. Nunca texto miúdo no creme." },
  { name: "Superfície", hex: dsColor.raised, note: "Cartões e campos, com borda que se distingue do creme." },
  { name: "Bronze", hex: dsColor.bronze, note: "Acento gráfico. Contraste insuficiente para texto pequeno." },
  { name: "Terracota", hex: dsColor.terracotta, note: "Acento gráfico. O perigo usável é o marrom queimado, não este tom." },
  { name: "Perigo", hex: dsColor.danger, note: "Erro e ação destrutiva, com texto creme." },
  { name: "Sucesso", hex: dsColor.success, note: "Estado positivo. Verde de sistema, não uma segunda marca." },
] as const;

const PRINCIPLES = [
  {
    eyebrow: "01",
    title: "Acolhimento",
    body: "Superfície creme, respiro largo e um convite primário por região. A página recebe antes de ornamentar.",
  },
  {
    eyebrow: "02",
    title: "Hierarquia",
    body: "Montserrat conduz o título. Inter conduz a leitura. Cada página tem um único título principal.",
  },
  {
    eyebrow: "03",
    title: "Ouro é ação",
    body: "O dourado preenche o botão primário e o selo de atenção. Não colore parágrafo sobre fundo claro.",
  },
  {
    eyebrow: "04",
    title: "Estados nomeados",
    body: "Carregando, vazio, erro e sucesso dizem o que aconteceu. A cor acompanha o texto, não o substitui.",
  },
  {
    eyebrow: "05",
    title: "Toque e teclado",
    body: "Alvo de 44 pixels, rótulo em todo campo, foco visível, Escape e ciclo de Tab nos diálogos.",
  },
  {
    eyebrow: "06",
    title: "Marca própria",
    body: "Lagoinha e Sara Nossa Terra inspiram acolhimento e clareza. A paleta e o símbolo continuam os desta igreja.",
  },
] as const;

function formatRatio(foreground: string, background: string): string {
  return contrastRatio(foreground, background).toFixed(2).replace(".", ",");
}

export function DesignSystemShowcase() {
  const [retryNote, setRetryNote] = useState("");

  return (
    <div id="ds-root" className={styles.scope}>
      <a className={styles.skip} href="#ds-conteudo">
        Ir para o conteúdo
      </a>
      <header className={styles.banner}>
        <div className={styles.bannerInner}>
          <p className={styles.kicker}>Fundação visual</p>
          <h1 className={styles.display}>Uma linguagem para o portal e os painéis.</h1>
          <p className={styles.lede}>
            Tipografia, cor, grade e componentes novos, para que cada frente desenhe com a mesma voz.
            Os cadastros desta página são fictícios e não saem do navegador.
          </p>
          <div className={styles.bannerLinks}>
            <a href={withBasePath("/")}>Portal público</a>
            <a href="#ds-painel">Ver o padrão de dashboard</a>
          </div>
        </div>
      </header>

      <main id="ds-conteudo" className={styles.main}>
        <section className={styles.section} aria-labelledby="ds-principios">
          <div>
            <h2 id="ds-principios">Princípios</h2>
            <p className={styles.sectionIntro}>
              Seis regras para manter o conjunto coerente sem copiar a identidade de outra comunidade.
            </p>
          </div>
          <div className={styles.principleGrid}>
            {PRINCIPLES.map((principle) => (
              <Card key={principle.title} eyebrow={principle.eyebrow} title={principle.title}>
                <p>{principle.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="ds-tokens">
          <div>
            <h2 id="ds-tokens">Cor e contraste</h2>
            <p className={styles.sectionIntro}>
              As razões abaixo são calculadas na página, no padrão WCAG. Texto normal precisa de 4,5.
              Borda e foco precisam de 3.
            </p>
          </div>
          <ul className={styles.swatches}>
            {SWATCHES.map((swatch) => (
              <li key={swatch.name} className={styles.swatch}>
                <span className={styles.chip} style={{ background: swatch.hex }} aria-hidden="true" />
                <strong>{swatch.name}</strong>
                <code>{swatch.hex}</code>
                <p>{swatch.note}</p>
              </li>
            ))}
          </ul>
          <TableContrast />
        </section>

        <section className={styles.section} aria-labelledby="ds-tipo">
          <div>
            <h2 id="ds-tipo">Tipografia</h2>
            <p className={styles.sectionIntro}>
              Montserrat para títulos, indicadores e botões. Inter para formulários, tabelas e texto corrido.
            </p>
          </div>
          <div className={styles.specimenGrid}>
            <article className={styles.specimen}>
              <strong>Título</strong>
              <p className={styles.displaySample}>Caminhar juntos, com clareza.</p>
              <p className={styles.meta}>Montserrat · peso 700 · entrelinha curta</p>
            </article>
            <article className={styles.specimen}>
              <strong>Leitura</strong>
              <p className={styles.bodySample}>
                Inter carrega a frase longa, o rótulo do campo e a célula da tabela. O tamanho de corpo é 16 pixels,
                com entrelinha 1,6.
              </p>
              <p className={styles.meta}>Inter · peso 400–600 · 16 px</p>
            </article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="ds-grade">
          <div>
            <h2 id="ds-grade">Grade</h2>
            <p className={styles.sectionIntro}>
              Quatro colunas até 767 pixels, oito a partir de 768 e doze a partir de 1440. O miolo tem no máximo 75 rem
              e não cria rolagem horizontal na página.
            </p>
          </div>
          <div className={styles.tracks} aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} className={styles.track}>
                {index + 1}
              </span>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="ds-componentes">
          <div>
            <h2 id="ds-componentes">Componentes</h2>
            <p className={styles.sectionIntro}>
              Button, Input, Card, Table, Loading, Error e Modal. A tabela e o diálogo completos estão no painel abaixo.
            </p>
          </div>
          <div className={styles.componentStack}>
            <Card eyebrow="Button" title="Uma ação primária, as demais em contorno">
              <div className={styles.cluster}>
                <Button>Salvar</Button>
                <Button variant="secondary">Cancelar</Button>
                <Button variant="ghost">Ver detalhes</Button>
                <Button variant="danger">Arquivar</Button>
                <Button disabled>Indisponível</Button>
              </div>
            </Card>
            <Card eyebrow="Input" title="Rótulo, ajuda e erro ligados ao campo">
              <div className={styles.specimenGrid}>
                <Input
                  id="ds-exemplo-nome"
                  label="Nome"
                  hint="Como a pessoa prefere ser chamada."
                  required
                  autoComplete="off"
                  defaultValue="Ana Lima"
                />
                <Input
                  id="ds-exemplo-erro"
                  label="E-mail"
                  required
                  defaultValue="ana.lima@"
                  error="Use um e-mail no formato nome@example.test."
                  autoComplete="off"
                />
              </div>
            </Card>
            <Card eyebrow="Loading" title="Espera com texto">
              <Loading label="Carregando cadastros sintéticos" />
              <Loading variant="skeleton" label="Preparando a lista" />
            </Card>
            <Card eyebrow="Error" title="Falha com caminho de saída">
              <ErrorState
                title="Não foi possível carregar"
                message="Este exemplo não consulta a rede. A tentativa abaixo só confirma o botão."
                onRetry={() => setRetryNote("Tentativa registrada só nesta página.")}
              />
              {retryNote ? <p role="status">{retryNote}</p> : null}
            </Card>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="ds-painel">
          <div>
            <h2 id="ds-painel">Padrão de dashboard</h2>
            <p className={styles.sectionIntro}>
              Cabeçalho, indicadores, filtro, tabela e diálogo de confirmação. Em 360 pixels a tabela vira lista. Em
              1440 os indicadores ficam em quatro colunas.
            </p>
          </div>
          <DashboardSample />
        </section>
      </main>
    </div>
  );
}

function TableContrast() {
  const rows = [
    ...dsApprovedPairs.map((pair) => ({ ...pair, verdict: "Usar" })),
    ...dsRejectedPairs.map((pair) => ({ ...pair, verdict: "Não usar" })),
  ];

  return (
    <div className={styles.contrastWrap} tabIndex={0} role="region" aria-labelledby="ds-contraste">
      <table className={`${styles.table} ${styles.contrastTable}`}>
        <caption id="ds-contraste" className={styles.caption}>
          Pares medidos
        </caption>
        <thead>
          <tr>
            <th scope="col">Par</th>
            <th scope="col">Frente</th>
            <th scope="col">Fundo</th>
            <th scope="col">Razão</th>
            <th scope="col">Mínimo</th>
            <th scope="col">Uso</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((pair) => (
            <tr key={pair.name}>
              <td>{pair.name}</td>
              <td>{pair.fg}</td>
              <td>{pair.bg}</td>
              <td>{formatRatio(pair.fg, pair.bg)}</td>
              <td>{pair.min.toFixed(1).replace(".", ",")}</td>
              <td>{pair.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
