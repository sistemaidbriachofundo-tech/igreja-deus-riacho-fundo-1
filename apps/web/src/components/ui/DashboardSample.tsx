"use client";

import { useMemo, useState } from "react";
import { Button } from "./Button";
import {
  DashboardPage,
  EmptyState,
  FilterBar,
  KpiCard,
  KpiGrid,
  StatusBadge,
} from "./Dashboard";
import { ErrorState } from "./Error";
import { Input, Select } from "./Input";
import { Loading } from "./Loading";
import { Modal } from "./Modal";
import { Table, type TableColumn } from "./Table";
import styles from "./ui.module.css";

type Status = "Ativo" | "Pendente" | "Arquivado";
type View = "dados" | "carregando" | "erro";

type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: Status;
};

const INITIAL: readonly Person[] = [
  { id: "p-01", name: "Ana Lima", email: "ana.lima@example.test", role: "Membro", status: "Ativo" },
  { id: "p-02", name: "Bruno Costa", email: "bruno.costa@example.test", role: "Voluntário", status: "Pendente" },
  { id: "p-03", name: "Clara Nunes", email: "clara.nunes@example.test", role: "Liderança", status: "Ativo" },
  { id: "p-04", name: "Diego Alves", email: "diego.alves@example.test", role: "Visitante", status: "Arquivado" },
];

const STATUS_OPTIONS = [
  { value: "Todos", label: "Todas as situações" },
  { value: "Ativo", label: "Ativo" },
  { value: "Pendente", label: "Pendente" },
  { value: "Arquivado", label: "Arquivado" },
] as const;

const TONE: Record<Status, "success" | "warning" | "neutral"> = {
  Ativo: "success",
  Pendente: "warning",
  Arquivado: "neutral",
};

function count(rows: readonly Person[], status: Status): string {
  return String(rows.filter((row) => row.status === status).length);
}

export function DashboardSample() {
  const [rows, setRows] = useState<Person[]>([...INITIAL]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("Todos");
  const [view, setView] = useState<View>("dados");
  const [createOpen, setCreateOpen] = useState(false);
  const [archive, setArchive] = useState<Person | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [notice, setNotice] = useState("Nenhum destes nomes representa uma pessoa real.");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesTerm = term.length === 0 || `${row.name} ${row.email}`.toLowerCase().includes(term);
      const matchesStatus = status === "Todos" || row.status === status;
      return matchesTerm && matchesStatus;
    });
  }, [query, rows, status]);

  const columns: readonly TableColumn<Person>[] = [
    { id: "name", header: "Nome", cell: (row) => row.name },
    { id: "email", header: "E-mail", cell: (row) => row.email },
    { id: "role", header: "Vínculo", cell: (row) => row.role },
    {
      id: "status",
      header: "Situação",
      cell: (row) => <StatusBadge tone={TONE[row.status]}>{row.status}</StatusBadge>,
    },
    {
      id: "action",
      header: "Ação",
      cell: (row) => (
        <Button
          variant="secondary"
          onClick={() => setArchive(row)}
          disabled={row.status === "Arquivado"}
        >
          Arquivar
        </Button>
      ),
    },
  ];

  function savePerson() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError("Informe o nome para continuar.");
      return;
    }
    const person: Person = {
      id: `p-${String(rows.length + 1).padStart(2, "0")}`,
      name: trimmed,
      email: "novo.cadastro@example.test",
      role: "Visitante",
      status: "Pendente",
    };
    setRows((current) => [person, ...current]);
    setName("");
    setNameError("");
    setCreateOpen(false);
    setNotice(`Cadastro sintético de ${person.name} adicionado só nesta página.`);
  }

  function confirmArchive() {
    if (!archive) return;
    setRows((current) =>
      current.map((row) => (row.id === archive.id ? { ...row, status: "Arquivado" } : row)),
    );
    setNotice(`${archive.name} arquivado só nesta lista local.`);
    setArchive(null);
  }

  const modalOpen = createOpen || archive !== null;

  return (
    <>
    <div className={styles.dashboardGrid}>
      <DashboardPage
        title="Painel de cadastros"
        lede="Padrão para as frentes internas: título, indicador, filtro, tabela e diálogo. A lista vive só no navegador."
        actions={
          <Button id="ds-novo" onClick={() => setCreateOpen(true)}>
            Novo cadastro
          </Button>
        }
      >
        <KpiGrid>
          <KpiCard label="Cadastros" value={String(rows.length)} hint="Contagem local" />
          <KpiCard label="Ativos" value={count(rows, "Ativo")} hint="Situação sintética" />
          <KpiCard label="Pendentes" value={count(rows, "Pendente")} hint="Sem gravação" />
          <KpiCard label="Arquivados" value={count(rows, "Arquivado")} hint="Ação reversível só aqui" />
        </KpiGrid>

        <div className={styles.cluster} role="group" aria-label="Pré-visualização do painel">
          {(
            [
              ["dados", "Dados"],
              ["carregando", "Carregando"],
              ["erro", "Erro"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={view === value ? "primary" : "secondary"}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <FilterBar label="Filtrar cadastros sintéticos">
          <Input
            id="ds-busca"
            label="Buscar"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome ou e-mail"
          />
          <Select
            id="ds-situacao"
            label="Situação"
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof STATUS_OPTIONS)[number]["value"])}
            options={STATUS_OPTIONS}
          />
        </FilterBar>

        <p role="status">{notice}</p>

        {view === "carregando" ? (
          <Loading label="Carregando cadastros sintéticos" />
        ) : null}
        {view === "erro" ? (
          <ErrorState
            title="Não foi possível mostrar a lista"
            message="Falha simulada, sem servidor. Nada foi consultado fora desta página."
            onRetry={() => setView("dados")}
          />
        ) : null}
        {view === "dados" ? (
          <Table
            caption="Cadastros sintéticos"
            columns={columns}
            rows={filtered}
            getRowKey={(row) => row.id}
            empty={
              <EmptyState
                title="Nada por aqui"
                message="Nenhum cadastro sintético corresponde ao filtro."
              />
            }
          />
        ) : null}
      </DashboardPage>

      <aside aria-label="Como usar este padrão">
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Para as outras frentes</p>
          <h3 className={styles.cardTitle}>O que este painel já resolve</h3>
          <div className={styles.cardBody}>
            <p>Um convite primário por região, indicadores com rótulo e uma tabela que vira lista em telas estreitas.</p>
            <p>Erro, carregamento e vazio têm texto. A cor não é o único sinal.</p>
            <p>O diálogo prende o Tab, fecha com Escape e devolve o foco ao botão que o abriu.</p>
          </div>
        </div>
      </aside>
    </div>

      {modalOpen ? <div className={styles.modalHost}>
      <Modal
        open={createOpen}
        title="Novo cadastro sintético"
        description="O registro aparece na lista desta página e desaparece ao recarregar. Não há API nesta fundação."
        onClose={() => {
          setCreateOpen(false);
          setNameError("");
        }}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            savePerson();
          }}
        >
          <Input
            id="ds-modal-nome"
            label="Nome"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError("");
            }}
            error={nameError}
            autoComplete="off"
          />
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setNameError("");
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">Salvar cadastro</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={archive !== null}
        title="Arquivar cadastro sintético"
        description="A situação muda só na lista local. Não existe exclusão nem chamada de rede."
        onClose={() => setArchive(null)}
      >
        <p>
          Arquivar <strong>{archive?.name}</strong>?
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setArchive(null)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirmArchive}>
            Arquivar
          </Button>
        </div>
      </Modal>
      </div> : null}
    </>
  );
}
