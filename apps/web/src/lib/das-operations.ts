/** DAS v1.1 — visão segura de contratos HML. Não inventar registros de negócio. */
export type DasModule =
  | "pastoral" | "discipulado" | "celulas" | "ministerios" | "escalas"
  | "financeiro" | "eventos" | "indicadores" | "educacao" | "patrimonio" | "comunicacao";

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
  {id:"escalas",label:"Escalas",phase:"F3",description:"Cultos, funções, atribuições e confirmações.",endpoint:"/rosters",envelope:"rosters",allowedRoles:["PASTOR","SECRETARIA","LIDER_MINISTERIO"]},
  {id:"financeiro",label:"Tesouraria",phase:"F4",description:"Plano de contas, lançamentos e conciliações restritas.",endpoint:"/ledger/accounts",envelope:"accounts",allowedRoles:["TESOURARIA"]},
  {id:"eventos",label:"Eventos",phase:"F4",description:"Programação administrativa, sem inscrições ou pagamentos fictícios.",endpoint:"/events",envelope:"events",allowedRoles:["PASTOR","SECRETARIA","LIDER_MINISTERIO","PLATFORM_ADMIN"]},
  {id:"educacao",label:"Ensino e EBD",phase:"F5",description:"Cursos, turmas, matrículas, frequência e conclusão com trilha de auditoria.",endpoint:"/courses",envelope:"courses",allowedRoles:["PASTOR","SECRETARIA","LIDER_MINISTERIO","PLATFORM_ADMIN"]},
  {id:"comunicacao",label:"Comunicação",phase:"F5",description:"Modelos, provedores, fila de mensagens e rastreio, sem envio automático.",endpoint:"/channels/templates",envelope:"templates",allowedRoles:["PASTOR","SECRETARIA","PLATFORM_ADMIN"]},
  {id:"patrimonio",label:"Patrimônio",phase:"F6",description:"Inventário, conservação, responsáveis e histórico por congregação.",endpoint:"/assets",envelope:"assets",allowedRoles:["PASTOR","SECRETARIA","TESOURARIA","PLATFORM_ADMIN"]},
  {id:"indicadores",label:"Indicadores",phase:"F6",description:"Resumo institucional disponibilizado pela API, sujeito a métricas ainda em evolução.",endpoint:"/indicators/summary",envelope:"summary",allowedRoles:["PASTOR","SECRETARIA","TESOURARIA"],dataKind:"summary"},
] as const;


/** Views complementares suportadas pela API; nenhuma publicação/ação financeira é automática. */
export type DasResourceTab={id:string;label:string;endpoint:string;envelope:string;dataKind?:"summary"|"list"};
export const DAS_RESOURCE_TABS:Partial<Record<DasModule,readonly DasResourceTab[]>>={
  financeiro:[
    {id:"accounts",label:"Plano de contas",endpoint:"/ledger/accounts",envelope:"accounts"},
    {id:"entries",label:"Lançamentos",endpoint:"/ledger/entries",envelope:"entries"},
    {id:"imports",label:"Importações",endpoint:"/ledger/imports",envelope:"batches"},
    {id:"reconciliations",label:"Conciliação",endpoint:"/ledger/reconciliations",envelope:"reconciliations"},
  ],
  indicadores:[
    {id:"summary",label:"Resumo institucional",endpoint:"/indicators/summary",envelope:"summary",dataKind:"summary"},
    {id:"memberships",label:"Membresia",endpoint:"/indicators/membership",envelope:"summary",dataKind:"summary"},
  ],
};

export function canViewDasModule(grants: readonly string[], roles: readonly string[]) {
  // PLATFORM_ADMIN não tem acesso implícito a pastoral ou tesouraria.
  const restricted=roles.length===1 && (roles[0]==="PASTOR" || roles[0]==="TESOURARIA");
  return grants.some(role => roles.includes(role)) || (!restricted && grants.includes("PLATFORM_ADMIN"));
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
  if(/404|not found|não encontrad/i.test(error.message))return "Recurso não encontrado ou ainda não publicado na API de homologação.";
  if(/429|rate/i.test(error.message))return "Limite temporário de solicitações. Tente mais tarde.";
  return "Operação não concluída. Verifique os dados e a disponibilidade da API.";
}
/** Converte valores monetários de entrada, sem arredondamentos implícitos. */
export function parseAmountCents(input:string):number|null {
  const raw=input.trim();
  // Aceita 1234,56, 1.234,56, 1234.56 e 1234; rejeita negativos, notação e excesso de casas.
  const group=/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;
  const simple=/^\d+(?:[,.]\d{1,2})?$/;
  if(!group.test(raw)&&!simple.test(raw))return null;
  const normalized=group.test(raw)?raw.replaceAll(".","").replace(",","."):raw.replace(",",".");
  const [whole,decimal=""]=normalized.split(".");
  const cents=Number(whole)*100+Number(decimal.padEnd(2,"0"));
  return Number.isSafeInteger(cents)&&cents>0?cents:null;
}

export function formatBRL(value:number) {
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value/100);
}


/** Interpreta um datetime-local como hora da congregação, não do dispositivo. */
export function churchLocalToISO(input:string):string|null {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input);
  if(!match)return null;
  const [,y,m,d,h,min]=match;
  const [year,month,day,hour,minute]=[y,m,d,h,min].map(Number);
  const wanted=Date.UTC(year,month-1,day,hour,minute);
  const original=new Date(wanted);
  if(!Number.isFinite(wanted)||original.getUTCFullYear()!==year
    ||original.getUTCMonth()!==month-1||original.getUTCDate()!==day
    ||original.getUTCHours()!==hour||original.getUTCMinutes()!==minute)return null;
  const formatter=new Intl.DateTimeFormat("en-GB",{
    timeZone:"America/Sao_Paulo",hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",
  });
  const parts=(timestamp:number)=>{
    const result:Record<string,number>={};
    for(const part of formatter.formatToParts(new Date(timestamp))){
      if(["year","month","day","hour","minute"].includes(part.type))result[part.type]=Number(part.value);
    }
    return result;
  };
  let timestamp=wanted+3*60*60*1000;
  for(let pass=0;pass<3;pass++){
    const p=parts(timestamp);
    const observed=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
    timestamp+=wanted-observed;
  }
  const p=parts(timestamp);
  if(p.year!==year||p.month!==month||p.day!==day||p.hour!==hour||p.minute!==minute)return null;
  return new Date(timestamp).toISOString();
}
