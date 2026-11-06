#!/usr/bin/env node
/**
 * API HML Fase 1 — testes E2E com dados exclusivamente fictícios.
 * Nenhum token, senha ou dado pessoal é impresso.
 * Operações de escrita só com ALLOW_HML_WRITE_TESTS=yes e domínio HML.
 */
const base=process.env.API_BASE?.trim().replace(/\/+$/,"");
if(!base){console.error("API_BASE HML não definida");process.exit(2);}
let host;
try{host=new URL(base);}catch{console.error("API_BASE inválida");process.exit(2);}
if(host.protocol!=="https:"&&!["localhost","127.0.0.1"].includes(host.hostname)) {
  console.error("HML deve usar HTTPS");process.exit(2);
}
if(!host.hostname.includes("hml")&&!["localhost","127.0.0.1"].includes(host.hostname)) {
  console.error("Execução recusada: URL não identificada como HML");process.exit(2);
}
const password=process.env.HML_DEMO_PASSWORD;
const secretaryEmail=process.env.HML_SECRETARY_EMAIL??"ana.demo@example.test";
const pastorEmail=process.env.HML_PASTOR_EMAIL??"pastor.demo@example.test";
const memberEmail=process.env.HML_MEMBER_EMAIL??"bruno.demo@example.test";
if(!password){console.error("Falta HML_DEMO_PASSWORD; não inclua senhas na linha de comando");process.exit(2);}

async function request(path,token,method="GET",body){
 const res=await fetch(base+path,{method,headers:{
   Accept:"application/json",
   ...(token?{Authorization:"Bearer "+token}:{}),
   ...(body?{"Content-Type":"application/json"}:{})
 },body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 let json=null;try{json=await res.json();}catch{}
 return {status:res.status,json};
}
const assert=(condition,msg)=>{if(!condition)throw Error("FAIL: "+msg);console.log("PASS "+msg);};
async function login(email){
 const res=await request("/auth/login",undefined,"POST",{email,password});
 assert(res.status===201||res.status===200,"login de perfil fictício autorizado");
 assert(typeof res.json?.accessToken==="string","JWT retornado");
 return res.json.accessToken;
}
async function main(){
 const [health,ready,anon]=await Promise.all([
   request("/health"),request("/ready"),request("/memberships")
 ]);
 assert(health.status===200&&health.json?.status==="ok","liveness");
 assert(ready.status===200&&ready.json?.database==="ok","readiness do Postgres");
 assert(anon.status===401,"sem token não lista pessoas");
 const secretary=await login(secretaryEmail);
 const [me,people,processes,households,content]=await Promise.all([
   request("/auth/me",secretary),
   request("/memberships",secretary),
   request("/admissions",secretary),
   request("/households",secretary),
   request("/cms/contents",secretary)
 ]);
 assert(me.status===200,"identidade autenticada");
 assert(people.status===200&&Array.isArray(people.json?.memberships)&&people.json.memberships.length>=30,"cadastros fictícios persistidos");
 assert(processes.status===200&&Array.isArray(processes.json?.admissions)&&processes.json.admissions.length>=12,"admissões sintéticas com status");
 assert(households.status===200&&Array.isArray(households.json?.households),"núcleos familiares");
 assert(content.status===200,"conteúdo editorial autenticado");
 const pastor=await login(pastorEmail);
 const forbidden=await request("/memberships",pastor);
 assert(forbidden.status===403,"pastor não acessa listagem restrita à secretaria");
 const pastoral=await request("/admissions",pastor);
 assert(pastoral.status===200,"pastor consulta admissões");
 const member=await login(memberEmail);
 const own=await request("/credentials/me",member);
 assert(own.status===200,"membro consulta sua própria credencial");
 if(process.env.ALLOW_HML_WRITE_TESTS==="yes"){
   const suffix=Date.now().toString(36);
   const created=await request("/admissions",secretary,"POST",{
     displayName:"Pessoa Validacao "+suffix+" (fictício)",
     email:"validacao."+suffix+"@example.test",modality:"BATISMO"
   });
   assert(created.status===201&&Boolean(created.json?.id),"criação transacional auditada");
   const docs=await request("/admissions/"+encodeURIComponent(created.json.id)+"/advance",secretary,"POST",{completeStep:"documents"});
   assert(docs.status===201&&docs.json?.status==="AWAITING_SECRETARIA","transição documental");
   const denied=await request("/admissions/"+encodeURIComponent(created.json.id)+"/advance",secretary,"POST",{completeStep:"pastor",decision:"APPROVE"});
   assert(denied.status!==200&&denied.status!==201,"não permite saltar aprovação pastoral");
 }
 console.log("HML Fase 1: smoke concluído sem expor credenciais.");
}
main().catch(err=>{console.error(err instanceof Error?err.message:"Falha de HML");process.exitCode=1;});
