"use client";

import { PersonPicker } from "../PersonPicker";
import s from "./new-person-intake.module.css";

export type NewPersonProfile = {
  address: string;
  birthDate: string;
  baptismDate: string;
  firstAttendedOn: string;
  weddingDate: string;
  sex: string;
  isMinor: boolean;
  legalGuardianPersonId: string;
  householdId: string;
  householdLabel: string;
};

type Props = {
  name: string;
  email: string;
  profile: NewPersonProfile;
  families: Array<{ id: string; label: string }>;
  token: string;
  roles: string[];
  busy: boolean;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onProfile: (next: NewPersonProfile) => void;
};

export function personUnder18(birthDate: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [year,month,day] = birthDate.split("-").map(Number);
  const reference = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(now);
  const get = (key: string) => Number(reference.find(x=>x.type===key)?.value??0);
  return get("year") - year - (get("month") < month || (get("month") === month && get("day") < day) ? 1 : 0) < 18;
}

export function NewPersonIntake({
  name,email,profile,families,token,roles,busy,onName,onEmail,onProfile,
}: Props) {
  const update = (patch: Partial<NewPersonProfile>) => onProfile({...profile,...patch});
  const isMinor = profile.birthDate ? personUnder18(profile.birthDate) : profile.isMinor;
  return (
    <div className={s.intake}>
      <header className={s.intro}>
        <span>SECRETARIA · CADASTRO INICIAL</span>
        <h3>Cada pessoa tem uma história.</h3>
        <p>Registre o que já conhece. As informações serão salvas na homologação e usadas na Ficha 360.</p>
      </header>

      <fieldset className={s.section} disabled={busy}>
        <legend><b>01</b> Identificação e contato</legend>
        <div className={s.fields}>
          <label>Nome completo <small>Obrigatório</small>
            <input value={name} onChange={e=>onName(e.target.value)} required minLength={3} maxLength={160} autoComplete="off" placeholder="Nome e sobrenome"/>
          </label>
          <label>E-mail de homologação <small>Obrigatório</small>
            <input type="email" required value={email} onChange={e=>onEmail(e.target.value)} maxLength={254} placeholder="pessoa@example.test" autoComplete="off"/>
          </label>
          <label>Data de nascimento
            <input type="date" value={profile.birthDate} onChange={e=>update({birthDate:e.target.value,isMinor:personUnder18(e.target.value)})}/>
          </label>
          <label>Sexo informado
            <select value={profile.sex} onChange={e=>update({sex:e.target.value})}>
              <option value="">Não informado</option><option value="FEMALE">Feminino</option>
              <option value="MALE">Masculino</option><option value="OTHER">Outro</option>
            </select>
          </label>
          <label className={s.wide}>Endereço residencial
            <textarea rows={2} maxLength={500} value={profile.address} onChange={e=>update({address:e.target.value})} placeholder="Utilize apenas endereço fictício na homologação"/>
          </label>
        </div>
      </fieldset>

      <fieldset className={s.section} disabled={busy}>
        <legend><b>02</b> Família e responsáveis</legend>
        <div className={s.fields}>
          <label>Vincular a uma família existente
            <select value={profile.householdId} onChange={e=>update({householdId:e.target.value,householdLabel:""})}>
              <option value="">Não vinculada</option>
              {families.map(family=><option key={family.id} value={family.id}>{family.label}</option>)}
            </select>
          </label>
          <label>Ou criar um novo núcleo familiar
            <input maxLength={120} disabled={busy || Boolean(profile.householdId)}
              value={profile.householdLabel} onChange={e=>update({householdLabel:e.target.value})}
              placeholder="Ex.: Família Exemplo"/>
          </label>
          <label className={s.checkbox}>
            <input type="checkbox" checked={isMinor} disabled={Boolean(profile.birthDate) || busy}
              onChange={e=>update({isMinor:e.target.checked})}/>
            Pessoa menor de idade
          </label>
          {isMinor && <div className={s.wide}>
            <PersonPicker token={token} roles={roles} label="Responsável legal adulto"
              value={profile.legalGuardianPersonId} onChange={id=>update({legalGuardianPersonId:id})}
              placeholder="Buscar responsável cadastrado" required adultsOnly disabled={busy}/>
          </div>}
        </div>
      </fieldset>

      <fieldset className={s.section} disabled={busy}>
        <legend><b>03</b> Caminhada eclesiástica</legend>
        <div className={s.fields}>
          <label>Primeira frequência
            <input type="date" value={profile.firstAttendedOn} onChange={e=>update({firstAttendedOn:e.target.value})}/>
          </label>
          <label>Data de batismo
            <input type="date" value={profile.baptismDate} onChange={e=>update({baptismDate:e.target.value})}/>
          </label>
          <label>Data de casamento
            <input type="date" value={profile.weddingDate} onChange={e=>update({weddingDate:e.target.value})}/>
          </label>
        </div>
      </fieldset>
      <p className={s.note}><strong>Importante:</strong> cadastrar não concede membresia automaticamente. Admissão, transferências e aprovação pastoral seguem os fluxos oficiais da Secretaria. Nenhum dado real deve ser usado em HML.</p>
    </div>
  );
}
