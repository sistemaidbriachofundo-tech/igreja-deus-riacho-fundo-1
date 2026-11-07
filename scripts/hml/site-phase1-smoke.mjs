#!/usr/bin/env node
/**
 * HML Fase 1 — verificação anônima sem credenciais e sem escrita.
 * API_BASE deve apontar exclusivamente para a API de homologação.
 */
const base=process.env.API_BASE?.replace(/\/+$/,"");
if (!base) { console.error("Informe API_BASE da homologação"); process.exit(2); }
const parsed=new URL(base);
if (parsed.protocol!=="https:" || !/hml|localhost|127\.0\.0\.1/.test(parsed.hostname)) {
  console.error("Ambiente inválido: somente HML pode ser testada");process.exit(2);
}
let failures=0;
async function check(path,validator,description){
  try {
    const response=await fetch(base+path,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
    const body=await response.json().catch(()=>null);
    const good=validator(response.status,body);
    console.log((good?"OK ":"FALHOU ")+description+" (HTTP "+response.status+")");
    if(!good)failures++;
  } catch(err) {
    failures++;
    console.error("FALHOU "+description+": "+(err instanceof Error?err.message:"erro de rede"));
  }
}
await check("/health",(s,v)=>s===200&&v?.status==="ok","API online");
await check("/ready",(s,v)=>s===200&&v?.database==="ok","PostgreSQL online");
await check("/cms/site-layout",s=>s===401,"Editor não acessível sem autenticação");
await check("/cms/site-media",s=>s===401,"Biblioteca não acessível sem autenticação");
await check("/vivi/chat",s=>s===404||s===405||s===401,"Chat de equipe não liberado anonimamente");
await check("/vivi/status",(s,v)=>s===200&&["mock","gemini","manus"].includes(v?.provider)&&(v?.displayName==="Riachinho"||v?.assistant==="vivi"),"Riachinho registrado no backend (/vivi/status)");
await check("/public/site-layout",(s,v)=>s===200&&typeof v==="object"&&v!==null&&Object.prototype.hasOwnProperty.call(v,"layout")&&!Object.prototype.hasOwnProperty.call(v,"draft"),"Somente layout publicado exposto");
if(failures){console.error("HML: "+failures+" verificações falharam");process.exitCode=1}
else console.log("HML Fase 1: todas as verificações anônimas passaram.");
