import { ECCLESIASTICAL_ROLES, type EcclesiasticalRole } from "@idbrf/shared";
import s from "./ecclesiastical-roles.module.css";

export const ECCLESIASTICAL_ROLE_LABELS: Record<EcclesiasticalRole, string> = {
  PASTOR: "Pastor(a)",
  EVANGELIST: "Evangelista",
  DEACON: "Diácono(a)",
  MINISTRY_LEADER: "Líder de ministério",
};

export const ECCLESIASTICAL_ROLE_TOTAL_LABELS = {
  PASTOR: "Pastores",
  EVANGELIST: "Evangelistas",
  DEACON: "Diáconos",
  MINISTRY_LEADER: "Líderes de ministério",
} satisfies Record<EcclesiasticalRole, string>;

export function EcclesiasticalRoleFields({ value, onChange, ministryLeader }: {
  value: EcclesiasticalRole[];
  onChange: (value: EcclesiasticalRole[]) => void;
  ministryLeader?: boolean;
}) {
  return <div className={s.fields}>
    <p>Marque todas as funções que se aplicam ao membro nesta congregação.</p>
    {ministryLeader && <p>Esta pessoa já tem uma liderança vinculada em Ministérios.</p>}
    <div className={s.options}>
      {ECCLESIASTICAL_ROLES.map(role => <label key={role}>
        <input type="checkbox" checked={value.includes(role)} onChange={event => {
          const selected = event.target.checked;
          onChange(ECCLESIASTICAL_ROLES.filter(item => item === role ? selected : value.includes(item)));
        }} />
        {ECCLESIASTICAL_ROLE_LABELS[role]}
      </label>)}
    </div>
  </div>;
}
