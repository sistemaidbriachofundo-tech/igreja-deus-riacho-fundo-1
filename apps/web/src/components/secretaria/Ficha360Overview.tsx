import { dossierLabel, type PersonDossier, type PersonRecord } from "../secretary-dossier";
import { registrationLabel } from "../credentials/credential-model";
import type { PersonTimelineEvent } from "@idbrf/shared";
import s from "./ficha360-overview.module.css";

export type FichaTab = "visao" | "historico" | "cadastro" | "admissoes";
type Props = { person: PersonRecord; dossier: PersonDossier; canEdit: boolean; onTab: (tab: FichaTab) => void };

const EVENT_LABEL: Record<PersonTimelineEvent["type"], string> = {
  cadastro: "Origem do cadastro",
  vinculo: "Situação eclesiástica",
  admissao: "Admissão",
  transferencia: "Transferência",
  ministerio: "Liderança / função",
  marco: "Marco pessoal",
};
const EVENT_ICON: Record<PersonTimelineEvent["type"], string> = {
  cadastro: "✓", vinculo: "●", admissao: "✦", transferencia: "↗", ministerio: "♜", marco: "♥",
};

function dateLabel(value?: string | null) {
  if (!value) return "Não informado";
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  if (!(y && m && d)) return "Não informado";
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return "Não informado";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
}

function TimelinePreview({ events, onTab }: { events: PersonTimelineEvent[]; onTab: (tab: FichaTab)=>void }) {
  const recent = [...events].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 6);
  return <section className={s.story} aria-labelledby="ficha-story-title">
    <header className={s.sectionHeader}>
      <div>
        <span className={s.eyebrow}>MEMÓRIA ECLESIÁSTICA</span>
        <h3 id="ficha-story-title">A história desta pessoa na igreja</h3>
        <p>Admissões, mudanças de situação, funções, relacionamentos e marcos registrados.</p>
      </div>
      <button type="button" className={s.storyButton} onClick={()=>onTab("historico")}>Linha do tempo completa <span aria-hidden="true">↗</span></button>
    </header>
    {recent.length ? <ol className={s.storyList}>
      {recent.map((event,index) => <li key={event.type+"-"+event.id+"-"+index} className={s.storyItem} data-type={event.type}>
        <div className={s.storyRail} aria-hidden="true"><span>{EVENT_ICON[event.type]}</span></div>
        <article className={s.storyEntry}>
          <div className={s.storyMeta}><span>{EVENT_LABEL[event.type]}</span><time dateTime={event.date}>{dateLabel(event.date)}</time></div>
          <strong>{event.title}</strong>
          {event.detail && <p>{event.detail}</p>}
        </article>
      </li>)}
    </ol> : <div className={s.emptyStory}>
      <strong>Nenhum acontecimento registrado ainda.</strong>
      <p>O histórico será construído a partir das movimentações e aprovações realmente efetuadas no sistema.</p>
    </div>}
    {events.length > recent.length && <button type="button" className={s.moreHistory} onClick={()=>onTab("historico")}>Ver todos os {events.length} acontecimentos</button>}
  </section>;
}

export function Ficha360Overview({person, dossier, canEdit, onTab}: Props) {
  const membership = dossier.memberships[0];
  const fields = [
    ["Nome completo", person.displayName],
    ["E-mail", person.email],
    ["Endereço", person.address],
    ["Data de nascimento", person.birthDate],
    ["Sexo", person.sex],
    ["Primeira frequência", person.firstAttendedOn],
    ["Família", dossier.household?.label],
    ["Fotografia", person.photoUrl],
  ] as const;
  const filled = fields.filter(([,v]) => Boolean(v)).length;
  const completion = Math.round(filled / fields.length * 100);
  const facts = [
    { label: "Nascimento", value: dateLabel(person.birthDate), helper: person.sex === "FEMALE" ? "Feminino" : person.sex === "MALE" ? "Masculino" : person.sex === "OTHER" ? "Outro" : "Sexo não informado" },
    { label: "Primeira frequência", value: dateLabel(person.firstAttendedOn), helper: "Início da história com a congregação" },
    { label: "Batismo", value: dateLabel(person.baptismDate), helper: "Marco eclesiástico" },
    { label: "Casamento", value: dateLabel(person.weddingDate), helper: "Marco familiar" },
    { label: "Endereço", value: person.address || "Não informado", helper: "Residência cadastrada" },
    { label: "E-mail", value: person.email || "Não informado", helper: "Contato informado à Secretaria" },
  ];

  return <div className={s.overview}>
    <div className={s.introduction}>
      <div className={s.introCopy}>
        <span className={s.eyebrow}>VISÃO GERAL</span>
        <h3>Contato e caminhada</h3>
        <p>Os dados essenciais e o histórico da pessoa em um só lugar.</p>
      </div>
      <div className={s.completeness} aria-label="Qualidade do cadastro">
        <div className={s.completenessTop}><strong>{completion}%</strong><span>Preenchimento da ficha</span></div>
        <div className={s.track} role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100} aria-label="Campos básicos preenchidos">
          <i style={{width: completion+"%"}}/>
        </div>
        <small>{filled} de {fields.length} dados básicos cadastrados</small>
        {canEdit && completion < 100 && <button type="button" onClick={()=>onTab("cadastro")}>Completar informações <span aria-hidden="true">↗</span></button>}
      </div>
    </div>

    <section className={s.quickSummary} aria-label="Resumo do vínculo">
      <div><span>Vínculo</span><strong>{membership ? dossierLabel(membership.status) : "Sem vínculo"}</strong></div>
      <div><span>Família</span><strong>{dossier.household?.label || "Não vinculada"}</strong></div>
      <div><span>Primeira frequência</span><strong>{dateLabel(person.firstAttendedOn)}</strong></div>
    </section>

    <TimelinePreview events={dossier.timeline ?? []} onTab={onTab}/>

    <div className={s.detailsGrid}>
      <section className={s.detailCard} aria-label="Dados cadastrais">
        <header className={s.sectionHeader}>
          <div><span className={s.eyebrow}>DADOS DO MEMBRO</span><h3>Identificação e vida pessoal</h3></div>
          <button type="button" className={s.textAction} onClick={()=>onTab("cadastro")}>{canEdit ? "Editar cadastro" : "Ver cadastro"} <span aria-hidden="true">↗</span></button>
        </header>
        <dl className={s.facts}>
          {facts.map(f => <div key={f.label}>
            <dt>{f.label}</dt><dd>{f.value}</dd><small>{f.helper}</small>
          </div>)}
        </dl>
      </section>
      <div className={s.detailSide}>
        <section className={s.detailCard}>
          <header className={s.sectionHeader}><div><span className={s.eyebrow}>FAMÍLIA E RELACIONAMENTOS</span><h3>Seu núcleo de cuidado</h3></div></header>
          <p className={s.detailCaption}>{dossier.household?.label ? "Família "+dossier.household.label : "Família ainda não vinculada."}</p>
          {canEdit && dossier.household?.members.length ? <ul className={s.familyList}>
            {dossier.household.members.slice(0,12).map(member => <li key={member.id}>
              <span className={s.avatar} aria-hidden="true">{initials(member.displayName)}</span>
              <strong>{member.displayName}</strong>
              <small>{member.isMinor ? "Menor de idade" : "Familiar"}</small>
            </li>)}
          </ul> : <p className={s.emptyCaption}>Membros do núcleo familiar são apresentados conforme a permissão da Secretaria.</p>}
          {dossier.legalGuardian && <div className={s.guardian}><span>Responsável legal</span><strong>{dossier.legalGuardian.displayName}</strong></div>}
          {canEdit && dossier.dependents.length > 0 && <div className={s.dependentBlock}>
            <h4>Dependentes e pessoas sob cuidado</h4>
            <ul className={s.familyList}>{dossier.dependents.slice(0,12).map(member => <li key={member.id}>
              <span className={s.avatar} aria-hidden="true">{initials(member.displayName)}</span>
              <strong>{member.displayName}</strong>
              <small>{member.isMinor ? "Menor de idade" : "Dependente"}</small>
            </li>)}</ul>
          </div>}
          <p className={s.detailCaption}>Dependentes vinculados: <strong>{dossier.dependents.length}</strong></p>
        </section>
        <section className={s.detailCard}>
          <header className={s.sectionHeader}><div><span className={s.eyebrow}>SITUAÇÃO NA IGREJA</span><h3>Admissões e acesso</h3></div>
            <button type="button" className={s.textAction} onClick={()=>onTab("admissoes")}>Ver protocolos <span aria-hidden="true">↗</span></button></header>
          <dl className={s.quickFacts}>
            <div><dt>Protocolos de admissão</dt><dd>{dossier.admissionHistory.length}</dd></div>
            <div><dt>Vínculos eclesiásticos</dt><dd>{dossier.memberships.length}</dd></div>
            <div><dt>Acesso ao sistema</dt><dd>{dossier.access ? (dossier.access.status === "ACTIVE" ? "Ativo" : "Desativado") : "Sem conta de acesso"}</dd></div>
          </dl>
          {dossier.access && dossier.access.roles.length > 0 && <p className={s.roles}>Papéis: {dossier.access.roles.map(dossierLabel).join(", ")}</p>}
        </section>
      </div>
    </div>
  </div>;
}
