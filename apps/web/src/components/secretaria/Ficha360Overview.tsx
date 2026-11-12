import { dossierLabel, type PersonDossier, type PersonRecord } from "../secretary-dossier";
import { registrationLabel } from "../credentials/credential-model";
import s from "./ficha360-overview.module.css";

export type FichaTab = "visao" | "historico" | "cadastro" | "admissoes";
type Props = { person: PersonRecord; dossier: PersonDossier; canEdit: boolean; onTab: (tab: FichaTab) => void };

function dateLabel(value?: string | null) {
  if (!value) return "Não informado";
  const iso = value.slice(0,10);
  const [y,m,d] = iso.split("-").map(Number);
  if (!(y && m && d)) return "Não informado";
  return new Date(Date.UTC(y,m-1,d,12)).toLocaleDateString("pt-BR",{timeZone:"UTC",day:"2-digit",month:"long",year:"numeric"});
}

export function Ficha360Overview({person,dossier,canEdit,onTab}: Props) {
  const membership = dossier.memberships[0];
  const fields = [
    ["Nome completo",person.displayName],
    ["E-mail",person.email],
    ["Endereço",person.address],
    ["Data de nascimento",person.birthDate],
    ["Sexo",person.sex],
    ["Primeira frequência",person.firstAttendedOn],
    ["Família",dossier.household?.label],
    ["Fotografia",person.photoUrl],
  ] as const;
  const filled = fields.filter(([,v])=>Boolean(v)).length;
  const pct = Math.round(filled/fields.length*100);
  const facts = [
    {label:"Identificação",value:person.displayName,helper:"Nome no cadastro"},
    {label:"Nascimento",value:dateLabel(person.birthDate),helper:person.sex ? (person.sex==="FEMALE"?"Feminino":person.sex==="MALE"?"Masculino":"Outro") : "Sexo não informado"},
    {label:"Primeira frequência",value:dateLabel(person.firstAttendedOn),helper:"História com a congregação"},
    {label:"Batismo",value:dateLabel(person.baptismDate),helper:"Marco de fé"},
    {label:"Casamento",value:dateLabel(person.weddingDate),helper:"Marco familiar"},
    {label:"Endereço",value:person.address || "Não informado",helper:"Residência cadastrada"},
  ];
  return <div className={s.overview}>
    <div className={s.leading}>
      <div>
        <span className={s.eyebrow}>VISÃO GERAL DA PESSOA</span>
        <h3>Conhecer a história para cuidar de verdade.</h3>
        <p>A ficha reúne dados, vínculos e marcos já registrados na igreja. Informações que não estão no cadastro são apresentadas como não informadas.</p>
      </div>
      <div className={s.completeness}>
        <div><strong>{pct}%</strong><span>{filled} de {fields.length} informações básicas</span></div>
        <div className={s.track} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Informações básicas registradas"><i style={{width:pct+"%"}}/></div>
      </div>
    </div>
    <section className={s.statusGrid} aria-label="Situação eclesiástica e vínculos">
      <div className={s.statusCard}><span>SITUAÇÃO ECLESIÁSTICA</span><strong>{membership?dossierLabel(membership.status):"Sem vínculo"}</strong><small>{membership?"Desde "+dateLabel(membership.joinedAt):"Ainda sem vínculo nesta congregação"}</small></div>
      <div className={s.statusCard}><span>TIPO DE CADASTRO</span><strong>{dossierLabel(person.kind)}</strong><small>{dossierLabel(person.status)}</small></div>
      <div className={s.statusCard}><span>REFERÊNCIA FAMILIAR</span><strong>{dossier.household?.label??"Não vinculada"}</strong><small>{dossier.household?.members.length??0} pessoa(s) no núcleo</small></div>
      <div className={s.statusCard}><span>IDENTIFICAÇÃO</span><strong>{membership?registrationLabel(membership.id):"Em cadastramento"}</strong><small>{dossier.timeline?.length??0} eventos na linha do tempo</small></div>
    </section>
    <div className={s.columns}>
      <section className={s.card}>
        <header><span className={s.eyebrow}>DADOS CONHECIDOS</span><h3>Identificação e vida pessoal</h3></header>
        <dl className={s.facts}>
          {facts.map(f=><div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd><small>{f.helper}</small></div>)}
        </dl>
        <button className={s.action} type="button" onClick={()=>onTab("cadastro")}>{canEdit?"Conferir e atualizar cadastro":"Consultar dados do cadastro"} <span aria-hidden="true">↗</span></button>
      </section>
      <div className={s.side}>
        <section className={s.card}>
          <header><span className={s.eyebrow}>FAMÍLIA E CONEXÕES</span><h3>Pessoas, não apenas registros</h3></header>
          <p className={s.subtitle}>{dossier.household ? "Núcleo "+dossier.household.label:"Nenhuma família vinculada até o momento."}</p>
          {canEdit && dossier.household?.members.length ? <ul className={s.familyList}>{dossier.household.members.slice(0,10).map(m=><li key={m.id}><span>{m.displayName.slice(0,1).toLocaleUpperCase("pt-BR")}</span><strong>{m.displayName}</strong><small>{m.isMinor?"Menor de idade":"Pessoa da família"}</small></li>)}</ul>:
            <p className={s.muted}>Vínculos familiares são consultados conforme a permissão da Secretaria.</p>}
          {canEdit && dossier.dependents.length > 0 && <div className={s.dependents}>
            <h4>Dependentes vinculados</h4>
            <ul className={s.familyList}>
              {dossier.dependents.slice(0,10).map(child=><li key={child.id}>
                <span>{child.displayName.slice(0,1).toLocaleUpperCase("pt-BR")}</span>
                <strong>{child.displayName}</strong>
                <small>{child.isMinor?"Menor de idade":"Dependente"}</small>
              </li>)}
            </ul>
          </div>}
          <p className={s.summaryFooter}><strong>Dependentes:</strong> {dossier.dependents.length} · <strong>Responsável:</strong> {dossier.legalGuardian?.displayName??"Não informado"}</p>
        </section>
        <section className={s.card}>
          <header><span className={s.eyebrow}>HISTÓRIA ECLESIÁSTICA</span><h3>Últimos acontecimentos</h3></header>
          {dossier.timeline?.length ? <ol className={s.miniTimeline}>{dossier.timeline.slice(0,4).map(event=><li key={event.id}><span aria-hidden="true"/><div><strong>{event.title}</strong><small>{dateLabel(event.date)} · {event.detail || event.type}</small></div></li>)}</ol>:
            <p className={s.muted}>Ainda não há acontecimentos registrados neste histórico.</p>}
          <button className={s.action} type="button" onClick={()=>onTab("historico")}>Abrir linha do tempo completa <span aria-hidden="true">↗</span></button>
        </section>
      </div>
    </div>
  </div>;
}
