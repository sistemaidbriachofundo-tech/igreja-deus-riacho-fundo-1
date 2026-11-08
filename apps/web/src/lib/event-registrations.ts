/** RF-020–022: helpers puros para inscrições de homologação. Não registram dados reais. */
import { formatBRL, type DasRecord } from "./das-operations";

export type EventRegistrationInput = {
  displayName:string;
  modalityId:string;
  lotId:string;
  partySize:number;
  isMinor:boolean;
  guardianDisplayName:string;
};

export function isSyntheticLabel(label:string):boolean {
  return /^TESTE(?:[ _-]|$)/i.test(label.trim()) && label.trim().length>=7;
}

export function validateRegistration(input:EventRegistrationInput,modalities:readonly DasRecord[],lots:readonly DasRecord[]):string|null {
  if(!isSyntheticLabel(input.displayName))return "Use apenas um identificador fictício começando por TESTE, sem dados pessoais.";
  const modality=modalities.find(x=>x.id===input.modalityId);
  if(!modality)return "Selecione uma modalidade válida para o evento.";
  const min=typeof modality.minPartySize==="number"?modality.minPartySize:1;
  const max=typeof modality.maxPartySize==="number"?modality.maxPartySize:20;
  if(!Number.isInteger(input.partySize)||input.partySize<min||input.partySize>max)
    return "A quantidade de participantes está fora do limite da modalidade.";
  const remaining=modality.remaining;
  if(typeof remaining==="number"&&input.partySize>remaining)return "Vagas insuficientes na modalidade.";
  if(input.isMinor&&!isSyntheticLabel(input.guardianDisplayName))
    return "Para menor, informe um responsável fictício começando por TESTE.";
  if(!input.isMinor&&input.guardianDisplayName.trim())return "Informe responsável somente quando a inscrição for de menor.";
  if(input.lotId){
    const lot=lots.find(x=>x.id===input.lotId);
    if(!lot)return "Lote não encontrado neste evento.";
    if(typeof lot.modalityId==="string"&&lot.modalityId&&lot.modalityId!==input.modalityId)
      return "O lote selecionado não pertence à modalidade.";
    if(lot.status==="CLOSED")return "O lote está encerrado.";
    if(typeof lot.remaining==="number"&&input.partySize>lot.remaining)return "Vagas insuficientes no lote.";
  }
  return null;
}

export function toRegistrationPayload(input:EventRegistrationInput) {
  return {
    displayName:input.displayName.trim(),
    modalityId:input.modalityId,
    ...(input.lotId?{lotId:input.lotId}:{}),
    partySize:input.partySize,
    isMinor:input.isMinor,
    ...(input.isMinor?{guardianDisplayName:input.guardianDisplayName.trim()}:{}),
  };
}

export function canCheckInRegistration(row:DasRecord):boolean {
  return row.status==="CONFIRMED" && row.paymentStatus==="CONFIRMED_MOCK"
    && (row.isMinor!==true||row.guardianAuthStatus==="AUTHORIZED");
}

export function formatMockPrice(amount:unknown):string {
  return typeof amount==="number"&&Number.isSafeInteger(amount)&&amount>=0
    ? formatBRL(amount)+" · simulação" : "Valor não informado";
}
