export type SettingBehavior = "active" | "locked" | "documentary";

export function ruleState(item: { behavior?: SettingBehavior; editable?: boolean; behaviorNote?: string }) {
  if (item.behavior === "documentary" || (item.behavior == null && item.editable === false)) {
    return item.behaviorNote ?? "Documentada. Ainda não altera o sistema.";
  }
  if (item.behavior === "locked") return item.behaviorNote ?? "Bloqueio de segurança. O valor vigente não pode ser afrouxado.";
  return item.behavior === "active" ? (item.behaviorNote ?? "Em vigor") : "Em vigor";
}
