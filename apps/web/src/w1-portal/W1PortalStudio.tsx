"use client";

import { useState, type FormEvent } from "react";
import { withBasePath } from "../lib/paths";
import { DEPENDENCY_REPORT } from "./dependencies";
import { applyAltSuggestion, gateRiachinhoPrompt, SIMULATED_PROVIDER } from "./riachinho-gate";
import {
  agendaPieces,
  currentVersion,
  dispatch,
  EXAMPLE_DRAFT,
  EMPTY_DRAFT,
  initialStudio,
  pagePiece,
  PUBLIC_NAV,
  STATUS_LABEL,
  stepIndex,
  visibleVersion,
  type Command,
  type Draft,
  type DraftInput,
  type MediaAsset,
  type PageId,
  type Persona,
  type Studio,
  type Version,
} from "./workflow";
import s from "./w1-portal.module.css";

type Section = "portal" | "estudio" | "midia" | "riachinho";
type PreviewMode = "publicado" | "previa";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "portal", label: "Portal" },
  { id: "estudio", label: "Estúdio" },
  { id: "midia", label: "Mídia" },
  { id: "riachinho", label: "Riachinho" },
];

const STEPS = ["Rascunho", "Revisão", "Aprovação", "Prévia", "Publicação simulada"];

const SENSITIVE_SAMPLE = "Qual o CPF 123.456.789-09 do membro?";

export function W1PortalStudio() {
  const [studio, setStudio] = useState<Studio>(initialStudio);
  const [persona, setPersona] = useState<Persona>("editor");
  const [section, setSection] = useState<Section>("portal");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("publicado");
  const [activePage, setActivePage] = useState<PageId>("inicio");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<DraftInput>(EMPTY_DRAFT);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "erro">("ok");
  const [rightsAck, setRightsAck] = useState(false);
  const [mediaId, setMediaId] = useState(studio.media[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [riachinhoNote, setRiachinhoNote] = useState("");
  const [alts, setAlts] = useState<Array<string | undefined>>([
    "Pessoas em momento de louvor — imagem ilustrativa",
    "Momento de oração — imagem ilustrativa",
    "Leitura da Palavra — imagem ilustrativa",
    "Juventude reunida — imagem ilustrativa",
  ]);
  const [suggestion, setSuggestion] = useState("Alt 2: Comunidade em oração — imagem ilustrativa");

  const selected = studio.drafts.find((draft) => draft.id === selectedId) ?? null;
  const shown = visibleVersion(studio, previewMode);
  const showingPreview = previewMode === "previa" && studio.preview !== null;

  function run(command: Command) {
    const result = dispatch(studio, persona, command);
    setStudio(result.studio);
    setMessage(result.message);
    setTone(result.ok ? "ok" : "erro");
    if (result.ok && command.type === "preview") setPreviewMode("previa");
    if (result.ok && (command.type === "publish" || command.type === "rollback")) setPreviewMode("publicado");
    return result;
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected && selected.status === "rascunho") {
      run({ type: "update", id: selected.id, input: form });
      return;
    }
    const id = `draft-${studio.drafts.length + 1}`;
    const result = run({ type: "create", id, input: form });
    if (result.ok) setSelectedId(id);
  }

  function chooseDraft(draft: Draft) {
    setSelectedId(draft.id);
    setForm({
      page: draft.page,
      title: draft.title,
      summary: draft.summary,
      body: draft.body,
      whenLabel: draft.whenLabel,
      place: draft.place,
    });
  }

  return (
    <div className={s.page}>
      <a className={s.skip} href="#conteudo-w1">Pular para o conteúdo</a>
      <header className={s.hero}>
        <div className={s.wrap}>
          <p className={s.kicker}>Prévia isolada · issue #95 · dados sintéticos</p>
          <h1>Portal institucional e estúdio editorial</h1>
          <p className={s.lead}>
            Editor, revisão, aprovação, prévia e publicação simulada. Esta tela não altera Início, Quem somos, Agenda ou Login do site oficial.
          </p>
          <ul className={s.report} aria-label="Dependências da frente">
            {DEPENDENCY_REPORT.map((item) => (
              <li key={item.text}>
                <strong>{item.state}</strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <main id="conteudo-w1" className={s.wrap}>
        <div className={s.toolbar}>
          <fieldset className={s.personas}>
            <legend>Papel simulado</legend>
            <label>
              <input
                type="radio"
                name="persona"
                checked={persona === "editor"}
                onChange={() => setPersona("editor")}
                data-testid="w1-persona-editor"
              />
              Editor
            </label>
            <label>
              <input
                type="radio"
                name="persona"
                checked={persona === "publisher"}
                onChange={() => setPersona("publisher")}
                data-testid="w1-persona-publisher"
              />
              Publicador
            </label>
          </fieldset>
          <p className={s.hint}>
            {persona === "editor"
              ? "O editor escreve e envia. Não aprova e não publica."
              : "O publicador aprova, abre a prévia, publica só aqui e pode restaurar a versão anterior."}
          </p>
        </div>

        <div className={s.tabs} role="tablist" aria-label="Seções da prévia">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`aba-${item.id}`}
              aria-selected={section === item.id}
              aria-controls={`painel-${item.id}`}
              className={section === item.id ? s.tabOn : s.tab}
              data-testid={`w1-section-${item.id}`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div role="status" aria-live="polite" className={tone === "erro" ? s.feedbackErro : s.feedback} data-testid="w1-feedback">
          {message}
        </div>

        <div role="tabpanel" id={`painel-${section}`} aria-labelledby={`aba-${section}`} className={s.panel}>
          {section === "portal" && (
            <PublicPreview
              studio={studio}
              version={shown}
              showingPreview={showingPreview}
              activePage={activePage}
              previewMode={previewMode}
              onPage={setActivePage}
              onMode={setPreviewMode}
            />
          )}
          {section === "estudio" && (
            <EditorialDesk
              studio={studio}
              persona={persona}
              selected={selected}
              form={form}
              onForm={setForm}
              onChoose={chooseDraft}
              onSave={saveDraft}
              onRun={run}
              onExample={() => setForm(EXAMPLE_DRAFT)}
            />
          )}
          {section === "midia" && (
            <MediaShelf
              studio={studio}
              selected={selected}
              mediaId={mediaId}
              rightsAck={rightsAck}
              persona={persona}
              onMedia={setMediaId}
              onRights={setRightsAck}
              onAttach={() => {
                if (!selected) {
                  setTone("erro");
                  setMessage("Selecione um rascunho na aba Estúdio antes de associar a mídia.");
                  return;
                }
                run({ type: "attach-media", id: selected.id, mediaId, rightsAcknowledged: rightsAck });
              }}
            />
          )}
          {section === "riachinho" && (
            <RiachinhoDesk
              prompt={prompt}
              note={riachinhoNote}
              alts={alts}
              suggestion={suggestion}
              onPrompt={setPrompt}
              onSuggestion={setSuggestion}
              onGate={() => setRiachinhoNote(gateRiachinhoPrompt(prompt, SIMULATED_PROVIDER).reason)}
              onSample={() => {
                setPrompt(SENSITIVE_SAMPLE);
                setRiachinhoNote(gateRiachinhoPrompt(SENSITIVE_SAMPLE, SIMULATED_PROVIDER).reason);
              }}
              onApply={() => {
                const result = applyAltSuggestion(alts, suggestion);
                setAlts(result.alts);
                setRiachinhoNote(
                  result.applied === 0
                    ? "Nenhum Alt foi reconhecido. As descrições atuais foram mantidas."
                    : `${result.applied} descrição atualizada. Os Alts não citados permanecem iguais.`,
                );
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function PublicPreview({
  studio,
  version,
  showingPreview,
  activePage,
  previewMode,
  onPage,
  onMode,
}: {
  studio: Studio;
  version: Version;
  showingPreview: boolean;
  activePage: PageId;
  previewMode: PreviewMode;
  onPage: (page: PageId) => void;
  onMode: (mode: PreviewMode) => void;
}) {
  const inicio = pagePiece(version, "inicio");
  const quem = pagePiece(version, "quem-somos");
  const agenda = agendaPieces(version);
  const piece = activePage === "inicio" ? inicio : activePage === "quem-somos" ? quem : undefined;

  return (
    <section className={s.portal} aria-label="Prévia do portal público" data-official-site="inativo">
      <div className={s.portalBar}>
        <p>{showingPreview ? "Prévia ainda não publicada" : "Publicação simulada desta prévia"}</p>
        <div role="group" aria-label="Versão exibida">
          <button type="button" className={previewMode === "publicado" ? s.tabOn : s.tab} aria-pressed={previewMode === "publicado"} onClick={() => onMode("publicado")}>
            Publicação simulada
          </button>
          <button type="button" className={previewMode === "previa" ? s.tabOn : s.tab} aria-pressed={previewMode === "previa"} disabled={!studio.preview} onClick={() => onMode("previa")}>
            Prévia ainda não publicada
          </button>
        </div>
      </div>
      <div className={s.site}>
        <header className={s.mast}>
          <p className={s.brand}>Igreja de Deus <span>Riacho Fundo I</span></p>
          <nav className={s.nav} aria-label="Navegação do site público" data-testid="w1-nav">
            {PUBLIC_NAV.map((item) =>
              item.id === "login" ? (
                <a key={item.id} href={withBasePath("/login/")} aria-label="Login — abrir a tela oficial de e-mail e senha">
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  aria-current={activePage === item.id ? "page" : undefined}
                  onClick={() => onPage(item.id)}
                >
                  {item.label}
                </button>
              ),
            )}
          </nav>
        </header>
        <article className={s.story} data-testid="w1-public-title">
          {activePage !== "agenda" && piece && (
            <>
              <p className={s.kicker}>{activePage === "inicio" ? "Início" : "Quem somos"}</p>
              <h2>{piece.title}</h2>
              <p>{piece.summary}</p>
              <Figure studio={studio} mediaId={piece.mediaId} alt={piece.alt} />
              <p>{piece.body}</p>
            </>
          )}
          {activePage === "agenda" && (
            <>
              <p className={s.kicker}>Agenda</p>
              <h2>Agenda ilustrativa</h2>
              <ul className={s.agenda}>
                {agenda.map((item) => (
                  <li key={item.draftId}>
                    <h3>{item.title}</h3>
                    <p>{item.whenLabel} · {item.place}</p>
                    <p>{item.body}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
      </div>
      <p className={s.note}>Versão exibida: {version.label}. Site oficial inativo. Última publicação simulada: {currentVersion(studio).label}.</p>
    </section>
  );
}

function Figure({ studio, mediaId, alt }: { studio: Studio; mediaId: string | null; alt: string }) {
  const asset = studio.media.find((item) => item.id === mediaId);
  if (!asset) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={s.figure} src={withBasePath(asset.src)} alt={alt || asset.alt} />
  );
}

function EditorialDesk({
  studio,
  persona,
  selected,
  form,
  onForm,
  onChoose,
  onSave,
  onRun,
  onExample,
}: {
  studio: Studio;
  persona: Persona;
  selected: Draft | null;
  form: DraftInput;
  onForm: (input: DraftInput) => void;
  onChoose: (draft: Draft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onRun: (command: Command) => void;
  onExample: () => void;
}) {
  const editor = persona === "editor";
  const step = stepIndex(selected, studio);
  const editing = editor && (!selected || selected.status === "rascunho");

  return (
    <div className={s.split}>
      <section aria-labelledby="lista-rascunhos">
        <h2 id="lista-rascunhos">Peças editoriais</h2>
        {studio.drafts.length === 0 && <p>Nenhum rascunho ainda. A aba Portal mostra a linha de base sintética.</p>}
        <ul className={s.draftList}>
          {studio.drafts.map((draft) => (
            <li key={draft.id}>
              <button type="button" className={draft.id === selected?.id ? s.draftOn : s.draft} onClick={() => onChoose(draft)}>
                <strong>{draft.title}</strong>
                <span>{STATUS_LABEL[draft.status]} · {draft.page}</span>
              </button>
            </li>
          ))}
        </ul>
        <ol className={s.steps} aria-label="Jornada editorial">
          {STEPS.map((label, index) => (
            <li key={label} aria-current={selected && index === step ? "step" : undefined}>{label}</li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="form-rascunho">
        <h2 id="form-rascunho">{selected ? "Peça selecionada" : "Novo rascunho"}</h2>
        <form className={s.form} onSubmit={onSave}>
          <label>
            Página
            <select
              value={form.page}
              disabled={!editing}
              onChange={(event) => onForm({ ...form, page: event.target.value as PageId })}
            >
              <option value="inicio">Início</option>
              <option value="quem-somos">Quem somos</option>
              <option value="agenda">Agenda</option>
            </select>
          </label>
          <label>
            Título
            <input data-testid="w1-title" value={form.title} disabled={!editing} maxLength={90} onChange={(event) => onForm({ ...form, title: event.target.value })} />
          </label>
          <label>
            Resumo
            <input value={form.summary} disabled={!editing} maxLength={180} onChange={(event) => onForm({ ...form, summary: event.target.value })} />
          </label>
          <label>
            Texto
            <textarea value={form.body} disabled={!editing} maxLength={800} rows={4} onChange={(event) => onForm({ ...form, body: event.target.value })} />
          </label>
          {form.page === "agenda" && (
            <>
              <label>
                Horário ilustrativo
                <input value={form.whenLabel} disabled={!editing} onChange={(event) => onForm({ ...form, whenLabel: event.target.value })} />
              </label>
              <label>
                Local ilustrativo
                <input value={form.place} disabled={!editing} onChange={(event) => onForm({ ...form, place: event.target.value })} />
              </label>
            </>
          )}
          <div className={s.actions}>
            <button type="button" className={s.secondary} onClick={onExample} disabled={!editor}>Preencher exemplo sintético</button>
            <button type="submit" className={s.primary} disabled={!editing} data-testid="w1-save">Salvar rascunho</button>
            <button type="button" className={s.primary} disabled={!editor || selected?.status !== "rascunho"} data-testid="w1-submit" onClick={() => selected && onRun({ type: "submit", id: selected.id })}>
              Enviar para revisão
            </button>
            <button type="button" className={s.secondary} disabled={!editor || selected?.status !== "em_revisao"} onClick={() => selected && onRun({ type: "withdraw", id: selected.id })}>
              Retirar da revisão
            </button>
            <button type="button" className={s.secondary} disabled={editor || selected?.status !== "em_revisao"} data-testid="w1-reject" onClick={() => selected && onRun({ type: "reject", id: selected.id })}>
              Devolver ao editor
            </button>
            <button type="button" className={s.primary} disabled={editor || selected?.status !== "em_revisao"} data-testid="w1-approve" onClick={() => selected && onRun({ type: "approve", id: selected.id })}>
              Aprovar
            </button>
            <button type="button" className={s.primary} disabled={editor || !studio.drafts.some((draft) => draft.status === "aprovado")} data-testid="w1-preview" onClick={() => onRun({ type: "preview" })}>
              Montar prévia
            </button>
            <button type="button" className={s.primary} disabled={editor || !studio.preview} data-testid="w1-publish" onClick={() => onRun({ type: "publish" })}>
              Publicar simulado
            </button>
            <button type="button" className={s.secondary} disabled={editor || studio.versions.length < 2} data-testid="w1-rollback" onClick={() => onRun({ type: "rollback" })}>
              Restaurar versão anterior
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MediaShelf({
  studio,
  selected,
  mediaId,
  rightsAck,
  persona,
  onMedia,
  onRights,
  onAttach,
}: {
  studio: Studio;
  selected: Draft | null;
  mediaId: string;
  rightsAck: boolean;
  persona: Persona;
  onMedia: (id: string) => void;
  onRights: (value: boolean) => void;
  onAttach: () => void;
}) {
  return (
    <section aria-labelledby="biblioteca-midia">
      <h2 id="biblioteca-midia">Biblioteca ilustrativa</h2>
      <p>As imagens já publicadas no repositório aparecem aqui como acervo sintético. Não há upload nem armazenamento novo.</p>
      <ul className={s.mediaGrid}>
        {studio.media.map((asset) => (
          <li key={asset.id}>
            <MediaCard asset={asset} selected={asset.id === mediaId} onSelect={() => onMedia(asset.id)} />
          </li>
        ))}
      </ul>
      <label className={s.check}>
        <input type="checkbox" checked={rightsAck} onChange={(event) => onRights(event.target.checked)} />
        Confirmo o uso ilustrativo desta imagem só na prévia.
      </label>
      <button type="button" className={s.primary} disabled={persona !== "editor"} onClick={onAttach}>
        Associar ao rascunho {selected ? `“${selected.title}”` : ""}
      </button>
    </section>
  );
}

function MediaCard({ asset, selected, onSelect }: { asset: MediaAsset; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={selected ? s.mediaOn : s.media} aria-pressed={selected} onClick={onSelect}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBasePath(asset.src)} alt="" />
      <span>{asset.label}</span>
      <small>{asset.rightsConfirmed ? "Cessão ilustrativa registrada" : "Sem cessão — bloqueado"}</small>
      <small>{asset.alt}</small>
    </button>
  );
}

function RiachinhoDesk({
  prompt,
  note,
  alts,
  suggestion,
  onPrompt,
  onSuggestion,
  onGate,
  onSample,
  onApply,
}: {
  prompt: string;
  note: string;
  alts: Array<string | undefined>;
  suggestion: string;
  onPrompt: (value: string) => void;
  onSuggestion: (value: string) => void;
  onGate: () => void;
  onSample: () => void;
  onApply: () => void;
}) {
  return (
    <div className={s.split}>
      <section aria-labelledby="riachinho-envio">
        <h2 id="riachinho-envio">Riachinho no estúdio</h2>
        <p>
          Provedor <strong>mock</strong>, sem credencial. Nenhuma pergunta sai desta página. Não escreva dado de membro, criança, pastoral ou financeiro.
        </p>
        <label>
          Orientação editorial
          <textarea value={prompt} rows={4} maxLength={1800} onChange={(event) => onPrompt(event.target.value)} data-testid="w1-riachinho-prompt" />
        </label>
        <div className={s.actions}>
          <button type="button" className={s.primary} data-testid="w1-riachinho-send" onClick={onGate}>Tentar enviar</button>
          <button type="button" className={s.secondary} data-testid="w1-riachinho-sensitive" onClick={onSample}>
            Testar bloqueio de dado sensível
          </button>
        </div>
        <p role="status" data-testid="w1-riachinho-note">{note}</p>
      </section>
      <section aria-labelledby="riachinho-alt">
        <h2 id="riachinho-alt">Sugestão de Alt</h2>
        <p>Cole uma resposta estruturada. Só o número citado muda; as outras fotos conservam a descrição.</p>
        <label>
          Resposta para aplicar localmente
          <textarea value={suggestion} rows={3} onChange={(event) => onSuggestion(event.target.value)} />
        </label>
        <button type="button" className={s.primary} data-testid="w1-apply-alt" onClick={onApply}>Aplicar Alt citado</button>
        <ol className={s.alts}>
          {alts.map((alt, index) => (
            <li key={index} data-testid={`w1-alt-${index + 1}`}>Alt {index + 1}: {alt}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
