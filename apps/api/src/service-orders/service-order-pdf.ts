import PDFDocument from "pdfkit";
import "pdfkit/standard-fonts/Helvetica";
import type { ServiceOrderDto } from "@idbrf/shared";

const dt = new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"full",timeStyle:"short"});
const hm = new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"});
const status:Record<string,string>={DRAFT:"RASCUNHO — NÃO PUBLICADA",APPROVED:"APROVADA — AGUARDA PUBLICAÇÃO",PUBLISHED:"PUBLICADA"};
export function renderServiceOrderPdf(order: ServiceOrderDto): Promise<Buffer> {
  return new Promise((resolve,reject)=>{
    const pdf=new PDFDocument({size:"A4",margin:40,info:{Title:"Ordem de Culto — "+order.title,Author:"Igreja de Deus Riacho Fundo I"}});
    const chunks:Buffer[]=[];
    pdf.on("data",(chunk:Buffer)=>chunks.push(chunk));pdf.on("end",()=>resolve(Buffer.concat(chunks)));pdf.on("error",reject);
    const W=595;
    const header=()=>{
      pdf.rect(0,0,W,92).fill("#171717");
      pdf.rect(0,92,W,5).fill("#C9A76B");
      pdf.fillColor("#E8D2A4").font("Helvetica-Bold").fontSize(10).text("IGREJA DE DEUS · RIACHO FUNDO I",40,24,{width:515});
      pdf.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(21).text("Ordem de Culto",40,42,{width:515});
      pdf.fillColor("#59616B").font("Helvetica").fontSize(10).text(order.title,40,112,{width:515});
      pdf.fontSize(9).text(dt.format(new Date(order.serviceAt)),40,130,{width:515});
      pdf.font("Helvetica-Bold").fillColor(order.status==="PUBLISHED"?"#286B52":"#8A651F").fontSize(9)
        .text(status[order.status]??order.status,40,146,{width:515});
      pdf.moveTo(40,164).lineTo(555,164).strokeColor("#E2E4E8").lineWidth(1).stroke();
      pdf.y=176;
    };
    const footer=()=>{
      pdf.fillColor("#59616B").font("Helvetica").fontSize(8)
        .text("Uso interno da congregação · Documento gerado pelo sistema ID Riacho 1",40,810,{width:515,align:"center"});
    };
    header();
    let cursor=new Date(order.serviceAt).getTime();
    const first=order.items[0];
    if(first?.title.toLowerCase().includes("prel")&&first.minutes)cursor-=first.minutes*60000;
    for (const [position,item] of order.items.entries()){
      if(pdf.y>735){footer();pdf.addPage();header();}
      const start=hm.format(new Date(cursor));
      const who=item.responsible?.trim()||"A definir pela liderança";
      const mins=item.minutes??0;
      const title=item.title;
      const y=pdf.y;
      pdf.roundedRect(40,y,515,48,7).fill(position%2===0?"#F4F5F6":"#FFFFFF");
      pdf.fillColor("#171717").font("Helvetica-Bold").fontSize(11).text(start,51,y+9,{width:55});
      pdf.font("Helvetica-Bold").fontSize(10.5).text(title,110,y+8,{width:280,height:17,ellipsis:true});
      pdf.font("Helvetica").fontSize(8.5).fillColor("#59616B").text(who,110,y+25,{width:290,height:17,ellipsis:true});
      pdf.font("Helvetica-Bold").fillColor("#171717").fontSize(9).text(mins?String(mins)+" min":"A definir",449,y+16,{width:93,align:"right"});
      pdf.y=y+56;
      const extra=[item.microphone?("Microfone: "+item.microphone):"",item.equipment?("Equipamento: "+item.equipment):"",item.notes??""].filter(Boolean).join(" · ");
      if(extra){pdf.fillColor("#59616B").font("Helvetica").fontSize(8).text(extra,110,pdf.y,{width:420});pdf.y+=9;}
      cursor+=mins*60_000;
    }
    if(order.notes){
      if(pdf.y>680){footer();pdf.addPage();header();}
      pdf.moveDown(.8).fillColor("#171717").font("Helvetica-Bold").fontSize(10).text("ORIENTAÇÕES PASTORAIS");
      pdf.moveDown(.3).font("Helvetica").fontSize(9).fillColor("#59616B").text(order.notes,{width:510});
    }
    footer();pdf.end();
  });
}
