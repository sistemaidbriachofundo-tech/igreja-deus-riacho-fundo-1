/** DAS v1.1 — visão segura de contratos HML. Não inventar registros de negócio. */
export type DasModule =
  | "pastoral" | "discipulado" | "celulas" | "ministerios" | "escalas"
  | "financeiro" | "eventos" | "indicadores";

export type DasRecord = Record<string, unknown>;
export type DasDefinition = {
  id: DasModule;
  label: string;
  phase: string;
  description: string;
  endpoint: string;
  envelope: string;
  allowedRoles: readonly string[];
  dataKind?: "summary" | "list";
};

export const DAS_MODULES: readonly DasDefinition[] = [
  {id:"pastoral",label:"Cuidado pastoral",phase:"F2–F3",description:"Acompanhamento protegido, atribuições e histórico por finalidade.",endpoint:"/pastoral-cases",envelope:"cases",allowedRoles:["PASTOR"]},
  {id:"discipulado",label:"Discipulado",phase:"F2–F3",description:"Trilhas, matrículas, orientação e progresso.",endpoint:"/discipleship/tracks",envelope:"tracks",allowedRoles:["PASTOR","SECRETARIA","LIDER_MINISTERIO"]},
  {id:"celulas",label:"Células e grupos",phase:"F2–F3",description:"Grupos, anfitriões, encontros e frequência.",endpoint:"/small-groups",envelope:"groups",allowedRoles:["PASTOR","SECRETARIA","LIDER_MINISTERIO"]},
  {id:"ministerios",label:"Ministérios",phase:"F3",description:"Equipes, líderes e vínculos dos voluntários.",endpoint:"/ministries",envelope:"ministries",allowedRoles:["PASTOR","SECRETARIA","LIDER_MINISTERIO"]},
  {id:"escalas",label:"Escalas",phase:"F3",description:"Cultos, funções, atribuições e confirmações.",endpoint:"/rosters",envelope:"rosters",allowedRoles:["PASTOR","SECRETARIA","LIDER_MINISTERIO","MEMBRO"]},
  {id:"financeiro",label:"Tesouraria",phase:"F4",description:"Plano de contas, lançamentos e conciliações restritas.",endpoint:"/ledger/accounts",envelope:"accounts",allowedRoles:["TESOURARIA"]},
  {id:"eventos",label:"Eventos",phase:"F4",description:"Programação administrativa, sem inscrições ou pagamentos fictícios.",endpoint:"/events",envelope:"events",allowedRoles:["PASTOR","SECRETARIA"]},
  {id:"indicadores",label:"Indicadores",phase:"F6",description:"Resumo institucional disponibilizado pela API, sujeito a métricas ainda em evolução.",endpoint:"/indicators/summary",envelope:"summary",allowedRoles:["PASTOR","SECRETARIA","TESOURARIA"],dataKind:"summary"},
] as const;

export function canViewDasModule(grants: readonly string[], roles: readonly string[]) {
  return grants.includes("PLATFORM_ADMIN") || grants.some(role => roles.includes(role));
}

const asRecord = (value:unknown):DasRecord|null => 
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as DasRecord : null;

/** Fail closed: never replace an invalid API response with a fake empty list. */
export function readDasRows(payload:unknown, envelope:string):DasRecord[] {
  const body=Array.isArray(payload)?payload:asRecord(payload)?.[envelope];
  if (!Array.isArray(body)) throw new Error("Formato inesperado na resposta da API.");
  return body.map((item:unknown) => {
    const record=asRecord(item);
    if(!record) throw new Error("Registro inválido na resposta da API.");
    return record;
  });
}

export function readDasSummary(payload:unknown):DasRecord {
  const value=asRecord(payload);
  if(!value) throw new Error("Resumo de indicadores inválido.");
  return value;
}

/** Show only safe short scalar fields; never dump objects, internal notes or PII in generic lists. */
export function scalarLabel(record:DasRecord,fields:readonly string[],fallback="Registro") {
  for (const key of fields) {
    const value=record[key];
    if(typeof value === "string" && value.trim()) return value.trim().slice(0,140);
  }
  return fallback;
}
export function shortStatus(record:DasRecord) {
  const status=record.status??record.stage??record.publishStatus;
  return typeof status==="string" && /^[A-Z_]{2,40}$/.test(status)
    ? status.replaceAll("_"," ") : "Sem estado público";
}
export function formatChurchDate(value:unknown):string {
  if(typeof value!=="string"||!Number.isFinite(Date.parse(value)))return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR",{
    timeZone:"America/Sao_Paulo",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}
export function dasError(error:unknown):string {
  if(!(error instanceof Error))return "Não foi possível completar a operação.";
  if(/401|jwt|expirad/i.test(error.message))return "Sessão expirada. Faça login novamente no painel.";
  if(/403|permission|forbidden|papel|scope/i.test(error.message))return "Seu perfil não tem autorização para consultar ou alterar estes registros.";
  if(/409|conflict/i.test(error.message))return "Conflito de regra de negócio. Atualize os dados antes de tentar novamente.";
  if(/429|rate/i.test(error.message))return "Limite temporário de solicitações. Tente mais tarde.";
  return "Operação não concluída. Verifique os dados e a disponibilidade da API.";
}
