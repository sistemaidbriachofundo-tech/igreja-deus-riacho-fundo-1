"use client";

import { useCallback,useEffect,useState,type FormEvent } from "react";
import { getApiBaseUrl } from "../lib/api";
import s from "./site-team-manager.module.css";

type SiteRole="SITE_EDITOR"|"SITE_PUBLISHER";
type Member={id:string;userId:string;email:string;role:SiteRole;status:string;createdAt:string};

async function request<T>(token:string,path:string,method:"GET"|"POST"|"DELETE"="GET",body?:unknown):Promise<T>{
  if(!/^\/cms\/site-layout\/team(?:\/[a-zA-Z0-9_-]+)?$/.test(path))throw new Error("Rota inválida");
  const res=await fetch(getApiBaseUrl()+path,{
    method,mode:"cors",credentials:"omit",cache:"no-store",
    headers:{Authorization:"Bearer "+token,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  if(!res.ok){
    const msg=res.status===403?"Somente o administrador pode gerenciar a equipe.":
      res.status===404?"Usuário não cadastrado ou permissão inexistente.":
      res.status===401?"Sua sessão expirou.":
      "Operação não concluída ("+res.status+").";
    throw new Error(msg);
  }
  return await res.json() as T;
}

export function SiteTeamManager({token}:{token:string}){
  const [team,setTeam]=useState<Member[]>([]);
  const [email,setEmail]=useState("");
  const [role,setRole]=useState<SiteRole>("SITE_EDITOR");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const load=useCallback(async()=>{const data=await request<{team:Member[]}>(token,"/cms/site-layout/team");setTeam(data.team);},[token]);
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Não foi possível carregar a equipe."));},[load]);
  async function assign(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);setError("");setNotice("");
    try{
      await request(token,"/cms/site-layout/team","POST",{email:email.trim().toLowerCase(),role});
      await load();setEmail("");setNotice("Papel atribuído ao usuário cadastrado. Ele deve entrar novamente para atualizar suas permissões.");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao atribuir papel.");}
    finally{setBusy(false);}
  }
  async function revoke(member:Member){
    if(!window.confirm("Revogar "+member.role+" de "+member.email+"?"))return;
    setBusy(true);setError("");setNotice("");
    try{
      await request(token,"/cms/site-layout/team/"+encodeURIComponent(member.id),"DELETE");
      await load();setNotice("Permissão revogada. As sessões atuais expiram conforme o token.");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao revogar papel.");}
    finally{setBusy(false);}
  }
  return <section className={s.team} aria-label="Permissões da equipe do site">
    <div className={s.intro}><h2>Equipe de comunicação</h2>
      <p>Atribua permissões a contas que já existem no sistema. O Editor prepara conteúdo; o Publicador aprova alterações. Nenhum desses papéis dá acesso à secretaria ou aos dados de membros.</p></div>
    <form className={s.form} onSubmit={assign}>
      <label>E-mail de conta existente<input type="email" required autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} placeholder="colaborador@exemplo.com"/></label>
      <label>Permissão<select value={role} onChange={e=>setRole(e.target.value as SiteRole)}>
        <option value="SITE_EDITOR">Editor do Site — rascunho</option>
        <option value="SITE_PUBLISHER">Publicador do Site — aprovação</option>
      </select></label>
      <button type="submit" disabled={busy||!email.trim()}>{busy?"Atualizando…":"Atribuir permissão"}</button>
    </form>
    {error&&<div className={s.error} role="alert">{error}</div>}
    {notice&&<div className={s.notice} role="status">{notice}</div>}
    <div className={s.list}><h3>Equipe autorizada</h3>
      {team.length===0&&<p>Nenhuma conta com papel editorial específico neste ambiente.</p>}
      {team.map(member=><div className={s.person} key={member.id}>
        <div><strong>{member.email}</strong><small>{member.role==="SITE_EDITOR"?"Editor · cria rascunhos":"Publicador · aprova conteúdo"} · {member.status}</small></div>
        <button type="button" disabled={busy} onClick={()=>void revoke(member)}>Revogar</button>
      </div>)}
    </div>
    <p className={s.hint}>Esta tela não cria contas nem envia senhas. Para novos usuários, conclua antes o cadastro no fluxo institucional de contas.</p>
  </section>;
}
