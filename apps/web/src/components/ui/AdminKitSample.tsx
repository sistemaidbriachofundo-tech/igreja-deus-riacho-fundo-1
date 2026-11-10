"use client";

import { useState } from "react";
import { Alert } from "./Alert";
import { Avatar } from "./Avatar";
import { Breadcrumb } from "./Breadcrumb";
import { Button } from "./Button";
import { DataTable } from "./DataTable";
import { EmptyState } from "./Dashboard";
import { Drawer } from "./Drawer";
import { PageHeader } from "./PageHeader";
import { PasswordField } from "./PasswordField";
import { Skeleton } from "./Skeleton";
import { StatCard } from "./StatCard";
import { Tabs } from "./Tabs";
import { Tooltip } from "./Tooltip";
import styles from "./ui.module.css";

const PEOPLE = [
  { id: "p-01", name: "Ana Lima", role: "Membro" },
  { id: "p-02", name: "Bruno Costa", role: "Voluntário" },
] as const;

export function AdminKitSample() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAlert, setShowAlert] = useState(true);

  return (
    <div className={styles.stack}>
      <PageHeader
        eyebrow="Painel"
        title="Cadastros internos"
        description="Cabeçalho compacto, sem faixa grande. A trilha, o título e as ações quebram linha em 320 pixels."
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "Início", href: "#ds-conteudo" },
              { label: "Painel", href: "#ds-kit" },
              { label: "Cadastros" },
            ]}
          />
        }
        actions={
          <Tooltip content="Abre um painel lateral. Escape fecha e devolve o foco.">
            <Button onClick={() => setDrawerOpen(true)}>Abrir painel</Button>
          </Tooltip>
        }
      />

      <div className={styles.statGrid}>
        <StatCard label="Pessoas" value="2" hint="Lista fictícia desta página" />
        <StatCard label="Pendências" value="1" hint="Requer atenção" tone="warning" />
        <StatCard label="Ativas" value="1" hint="Situação positiva" tone="success" />
        <StatCard label="Arquivadas" value="0" hint="Nenhuma nesta lista" />
      </div>

      {showAlert ? (
        <Alert tone="info" title="Homologação" onDismiss={() => setShowAlert(false)}>
          Os nomes desta vitrine são fictícios e ficam só no navegador.
        </Alert>
      ) : (
        <p role="status">Aviso fechado só nesta página.</p>
      )}

      <Tabs
        label="Exemplos do kit"
        tabs={[
          {
            id: "pessoas",
            label: "Pessoas",
            panel: (
              <div className={styles.stack}>
                <div className={styles.cluster}>
                  {PEOPLE.map((person) => (
                    <span key={person.id} className={styles.personChip}>
                      <Avatar name={person.name} />
                      <span>{person.name}</span>
                    </span>
                  ))}
                </div>
                <DataTable
                  caption="Pessoas fictícias"
                  columns={[
                    { id: "name", header: "Nome", cell: (row) => row.name },
                    { id: "role", header: "Vínculo", cell: (row) => row.role },
                  ]}
                  rows={PEOPLE}
                  getRowKey={(row) => row.id}
                  toolbar={<p className={styles.meta}>Duas linhas sintéticas, sem gravação.</p>}
                />
                <PasswordField
                  id="ds-senha"
                  label="Senha de exemplo"
                  hint="O botão Mostrar mede 44 pixels nos dois eixos e não cobre o texto."
                  autoComplete="off"
                />
              </div>
            ),
          },
          {
            id: "avisos",
            label: "Avisos",
            panel: (
              <div className={styles.stack}>
                <Alert tone="success" title="Concluído">
                  O exemplo positivo usa texto, não só cor.
                </Alert>
                <Alert tone="warning" title="Atenção">
                  O ouro é fundo de aviso, com texto marrom.
                </Alert>
                <Alert tone="danger" title="Não foi possível concluir">
                  A mensagem explica o que falhou, sem consultar a rede.
                </Alert>
              </div>
            ),
          },
          {
            id: "vazio",
            label: "Vazio",
            panel: (
              <div className={styles.stack}>
                <EmptyState
                  title="Nada publicado"
                  message="Quando não houver registros, o texto permanece legível sobre o fundo claro."
                  action={<Button variant="secondary">Atualizar lista</Button>}
                />
                <Skeleton label="Carregando o bloco" />
              </div>
            ),
          },
        ]}
      />

      <Drawer
        open={drawerOpen}
        title="Filtros do painel"
        description="Fecha com Escape, com o botão Fechar ou ao clicar fora."
        onClose={() => setDrawerOpen(false)}
      >
        <p>Este painel ocupa a largura do celular e rola por dentro, sem arrastar a página.</p>
        <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
          Concluir
        </Button>
      </Drawer>
    </div>
  );
}
