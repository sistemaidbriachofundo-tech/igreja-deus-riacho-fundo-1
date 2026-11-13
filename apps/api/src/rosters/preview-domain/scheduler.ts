import type {Candidate, ExistingAssignment, RankedCandidate, Rules, SlotDemand, RejectionCode} from './types';
import {evaluateCandidate} from './eligibility';
import {isActiveStatus, localParts} from './time';

function pairScore(ids: readonly string[], slot: SlotDemand, history: readonly ExistingAssignment[], rules: Rules): number {
  const {month} = localParts(slot.serviceAt,rules.timeZone);
  let score=0;
  for(const id of ids){
    const active=history.filter(a=>isActiveStatus(a.status) && (a.personId===id || a.partnerPersonId===id));
    const recent=active.filter(a=>localParts(a.serviceAt,rules.timeZone).month===month);
    const thisPosition=recent.filter(a=>a.positionId===slot.positionId);
    score += recent.length*100 + thisPosition.length*80 + active.length;
    if(slot.rotationRule==='AVOID_NEXT_MONTH'){
      const now=localParts(slot.serviceAt,rules.timeZone).month;
      const [year,m]=now.split('-').map(Number);
      const previous=new Date(Date.UTC(year,m-2,1)).toISOString().slice(0,7);
      score+=active.filter(a=>a.positionId===slot.positionId && localParts(a.serviceAt,rules.timeZone).month===previous).length*200;
    }
  }
  return score;
}
/** Sugestão determinística; nunca publica nem atribui no banco. */
export function rankCandidates(slot: SlotDemand, candidates: readonly Candidate[], history: readonly ExistingAssignment[], rules: Rules): RankedCandidate[] {
  const result: RankedCandidate[]=[];
  const alreadySeen=new Set<string>();
  for(const candidate of candidates){
    const decision=evaluateCandidate(candidate,slot,candidates,history,rules);
    if(!decision.eligible) continue;
    const key=[...decision.personIds].sort((left, right) => (left < right ? -1 : Number(left > right))).join('|');
    if(alreadySeen.has(key)) continue;
    alreadySeen.add(key);
    result.push({candidate,personIds:decision.personIds,score:pairScore(decision.personIds,slot,history,rules)});
  }
  return result.sort((a,b)=>a.score-b.score || a.candidate.personId.localeCompare(b.candidate.personId));
}
export interface DraftAssignment {slotId:string; rosterId:string; personId:string; partnerPersonId:string|null; score:number}
export interface PreviewResult {drafts:DraftAssignment[]; unfilled: Array<{slotId:string; reasons:string[]}>}
/** Gera rascunho em memória. Persistência transacional e verificação de concorrência ficam no NestJS. */
export function previewSlots(slots: readonly SlotDemand[], candidates: readonly Candidate[], existing: readonly ExistingAssignment[], rules: Rules): PreviewResult {
  const temporary:ExistingAssignment[]=[...existing];
  const drafts:DraftAssignment[]=[];
  const unfilled:PreviewResult['unfilled']=[];
  for(const slot of [...slots].sort((a,b)=>a.serviceAt.localeCompare(b.serviceAt)||a.slotId.localeCompare(b.slotId))){
    const eligible=rankCandidates(slot,candidates,temporary,rules);
    if(!eligible.length){
      const failures=new Map<RejectionCode,number>();
      for(const p of candidates) for(const reason of evaluateCandidate(p,slot,candidates,temporary,rules).reasons) failures.set(reason,(failures.get(reason)??0)+1);
      unfilled.push({slotId:slot.slotId,reasons:[...failures].sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0])});
      continue;
    }
    const pick=eligible[0];
    drafts.push({slotId:slot.slotId,rosterId:slot.rosterId,personId:pick.personIds[0],partnerPersonId:pick.personIds[1]??null,score:pick.score});
    temporary.push({assignmentId:`PREVIEW:${slot.slotId}`,churchId:slot.churchId,ministryId:slot.ministryId,
      positionId:slot.positionId,rosterId:slot.rosterId,slotId:slot.slotId,serviceAt:slot.serviceAt,status:'PENDING',
      personId:pick.personIds[0],partnerPersonId:pick.personIds[1]??null});
  }
  return {drafts,unfilled};
}
