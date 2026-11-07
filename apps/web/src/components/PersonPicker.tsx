"use client";

import { useEffect, useId, useState } from "react";
import { apiGet } from "../lib/api";
import styles from "./person-picker.module.css";

type SearchHit={person?:{id?:string;displayName?:string;kind?:string;isMinor?:boolean}};
type SearchResponse={hits?:SearchHit[];autoMergeForbidden?:boolean};
type Props={
  token:string;roles:readonly string[];label:string;
  value:string;onChange:(personId:string)=>void;
  placeholder?:string;required?:boolean;help?:string;
};
const allowed=["PASTOR","SECRETARIA","PLATFORM_ADMIN"];
export function canSearchPersons(roles:readonly string[]):boolean {
  return roles.some(role=>allowed.includes(role));
}
export function PersonPicker({token,roles,label,value,onChange,placeholder,required,help}:Props){
  const inputId=useId();
  const [query,setQuery]=useState("");
  const [selectedName,setSelectedName]=useState("");
  const [hits,setHits]=useState<NonNullable<SearchResponse["hits"]>>([]);
  const [status,setStatus]=useState<"idle"|"loading"|"ready"|"error">("idle");
  const canSearch=canSearchPersons(roles);
  const term=query.trim();
  // Limpa o nome visível quando o formulário pai zera o personId após salvar.
  // A edição manual já limpa selectedName no próprio onChange.
  useEffect(()=>{
    if(!value&&selectedName){setSelectedName("");setQuery("");}
  },[value,selectedName]);
  useEffect(()=>{
    if(!canSearch||term.length<2||value){setHits([]);setStatus("idle");return;}
    let cancelled=false;
    const timer=setTimeout(()=>{
      setStatus("loading");
      void apiGet<SearchResponse>("/persons/search?q="+encodeURIComponent(term)+"&limit=8",token)
        .then(payload=>{
          if(cancelled)return;
          if(!Array.isArray(payload.hits))throw new Error("Formato inválido");
          setHits(payload.hits.filter(x=>typeof x.person?.id==="string"));
          setStatus("ready");
        }).catch(()=>{if(!cancelled){setHits([]);setStatus("error");}});
    },300);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[canSearch,token,term,value]);
  if(!canSearch)return <label className={styles.manual}>{label}
    <input required={required} value={value} onChange={e=>onChange(e.target.value)}
      maxLength={120} placeholder={placeholder??"ID do cadastro fictício"}/>
    <small>{help??"A busca de pessoas exige perfil autorizado. Use o ID validado na Secretaria."}</small>
  </label>;
  const select=(id:string,name:string)=>{
    onChange(id);setSelectedName(name);setQuery(name);setHits([]);setStatus("idle");
  };
  return <div className={styles.picker}>
    <label className={styles.searchLabel} htmlFor={inputId}>{label}</label>
    <div className={styles.control}>
      <input id={inputId} type="search" required={required&&!value}
        autoComplete="off" placeholder={placeholder??"Buscar pessoa fictícia pelo nome"}
        value={query} onChange={e=>{setQuery(e.target.value);setSelectedName("");if(value)onChange("");}}
        aria-describedby={inputId+"-helper"}/>
      {value&&<button type="button" onClick={()=>{onChange("");setSelectedName("");setQuery("");setHits([]);}}
        aria-label={"Limpar seleção de "+label} className={styles.clear}>Limpar</button>}
    </div>
    {value&&<p className={styles.selected} role="status">Selecionado: <strong>{selectedName||"Pessoa de teste"}</strong></p>}
    {!value&&term.length>=2&&status==="loading"&&<p className={styles.helper} role="status">Buscando cadastros autorizados…</p>}
    {!value&&term.length>=2&&status==="error"&&<p className={styles.error} role="alert">Busca indisponível. Confira seu perfil ou a API.</p>}
    {!value&&term.length>=2&&status==="ready"&&hits.length===0&&<p className={styles.helper} role="status">Nenhum cadastro encontrado. Confira a Secretaria.</p>}
    {!value&&hits.length>0&&<div className={styles.results} aria-label={"Resultados para "+label}>
      {hits.map((hit,index)=>{
        const person=hit.person!;
        return <button type="button" key={person.id??index} onClick={()=>select(person.id!,person.displayName||"Pessoa de teste")}>
          <span>{person.displayName||"Pessoa de teste"}</span><small>{person.isMinor?"Menor · cadastro protegido":person.kind==="VISITOR"?"Visitante":"Pessoa cadastrada"}</small>
        </button>;
      })}
    </div>}
    <small id={inputId+"-helper"} className={styles.helper}>{help??"A seleção não mescla cadastros e usa a identidade única do sistema."}</small>
  </div>;
}
