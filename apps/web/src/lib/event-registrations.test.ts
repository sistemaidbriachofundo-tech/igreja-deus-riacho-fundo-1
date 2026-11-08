import { describe, expect, it } from "vitest";
import {
  canCheckInRegistration, formatMockPrice, isSyntheticLabel,
  toRegistrationPayload, validateRegistration, type EventRegistrationInput
} from "./event-registrations";
import type { DasRecord } from "./das-operations";

const modalities:DasRecord[]=[
  {id:"m-family",name:"Família",minPartySize:2,maxPartySize:8,capacity:10,remaining:4},
  {id:"m-individual",name:"Individual",minPartySize:1,maxPartySize:1,remaining:0},
];
const lots:DasRecord[]=[
  {id:"lot-open",modalityId:"m-family",status:"OPEN",remaining:4,priceCents:2000},
  {id:"lot-closed",modalityId:"m-family",status:"CLOSED",remaining:4,priceCents:0},
  {id:"lot-wrong",modalityId:"m-individual",status:"OPEN",remaining:3,priceCents:0},
];
const base:EventRegistrationInput={
  displayName:"TESTE FAMÍLIA 01",modalityId:"m-family",lotId:"lot-open",
  partySize:3,isMinor:false,guardianDisplayName:""
};
describe("Evento — validação de inscrições sintéticas RF-020–022",()=>{
  it("exige identificador fictício explícito",()=>{
    expect(isSyntheticLabel("TESTE GRUPO 1")).toBe(true);
    expect(isSyntheticLabel("Maria Silva")).toBe(false);
    expect(validateRegistration({...base,displayName:"Pessoa Real"},modalities,lots)).toMatch(/fictício/);
  });
  it("aceita uma inscrição familiar dentro da capacidade",()=>{
    expect(validateRegistration(base,modalities,lots)).toBeNull();
  });
  it("rejeita modalidade, tamanho e lotes inválidos",()=>{
    expect(validateRegistration({...base,modalityId:"outro"},modalities,lots)).toMatch(/modalidade/);
    expect(validateRegistration({...base,partySize:1},modalities,lots)).toMatch(/quantidade/);
    expect(validateRegistration({...base,partySize:5},modalities,lots)).toMatch(/Vagas insuficientes/);
    expect(validateRegistration({...base,lotId:"lot-closed"},modalities,lots)).toMatch(/encerrado/);
    expect(validateRegistration({...base,lotId:"lot-wrong"},modalities,lots)).toMatch(/não pertence/);
    expect(validateRegistration({...base,lotId:"inexistente"},modalities,lots)).toMatch(/não encontrado/);
    expect(validateRegistration({...base,partySize:2.5},modalities,lots)).toMatch(/quantidade/);
  });
  it("obriga responsável sintético por menor e o omite para adulto",()=>{
    const child={...base,isMinor:true};
    expect(validateRegistration(child,modalities,lots)).toMatch(/responsável fictício/);
    expect(validateRegistration({...child,guardianDisplayName:"Nome verdadeiro"},modalities,lots)).toMatch(/responsável fictício/);
    const valid={...child,guardianDisplayName:"TESTE RESPONSÁVEL 01"};
    expect(validateRegistration(valid,modalities,lots)).toBeNull();
    expect(toRegistrationPayload(valid)).toMatchObject({isMinor:true,guardianDisplayName:"TESTE RESPONSÁVEL 01"});
    expect(toRegistrationPayload(base)).not.toHaveProperty("guardianDisplayName");
    expect(validateRegistration({...base,guardianDisplayName:"TESTE RESPONSÁVEL 01"},modalities,lots)).toMatch(/somente/);
  });
  it("não permite confirmar presença quando pagamento simulado está pendente",()=>{
    expect(canCheckInRegistration({status:"CONFIRMED",paymentStatus:"CONFIRMED_MOCK"})).toBe(true);
    for(const status of ["PENDING_PAYMENT","CANCELLED","CHECKED_IN"]){
      expect(canCheckInRegistration({status,paymentStatus:"CONFIRMED_MOCK"})).toBe(false);
    }
    expect(canCheckInRegistration({status:"CONFIRMED",paymentStatus:"PENDING"})).toBe(false);
    expect(canCheckInRegistration({status:"CONFIRMED",paymentStatus:"CONFIRMED_MOCK",isMinor:true,guardianAuthStatus:"PENDING"})).toBe(false);
    expect(canCheckInRegistration({status:"CONFIRMED",paymentStatus:"CONFIRMED_MOCK",isMinor:true,guardianAuthStatus:"AUTHORIZED"})).toBe(true);

  });
  it("preços informam simulação, nunca cobrança efetiva",()=>{
    expect(formatMockPrice(0)).toContain("simulação");
    expect(formatMockPrice(1200)).toContain("12,00");
    expect(formatMockPrice(-1)).toBe("Valor não informado");
  });
});
