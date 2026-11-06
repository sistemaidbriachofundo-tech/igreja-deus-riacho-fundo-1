import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { list, put } from "@vercel/blob";
import { randomUUID, createHash } from "node:crypto";
import { canEditSite } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";

const MAX_BYTES=3*1024*1024;
type SafeMime="image/jpeg"|"image/png"|"image/webp";

export function detectSiteImage(bytes:Buffer):{mime:SafeMime;extension:string}|null {
  if(bytes.length<12)return null;
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {mime:"image/jpeg",extension:"jpg"};
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:"image/png",extension:"png"};
  if(bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return {mime:"image/webp",extension:"webp"};
  return null;
}

@Injectable()
export class SiteMediaService {
  constructor(private readonly pilot:PilotService,private readonly prisma:PrismaService){}
  private async scope(actor:AuthUser){
    const target=await this.pilot.getPilotChurch();
    if(!canEditSite(actor.grants,target))throw new ForbiddenException("Sem permissão de mídia para esta igreja");
    return target;
  }
  private verifyStorage(){
    if(!process.env.BLOB_READ_WRITE_TOKEN?.trim())
      throw new ServiceUnavailableException("Armazenamento persistente de fotos ainda não configurado.");
  }

  async gallery(actor:AuthUser){
    const target=await this.scope(actor);
    this.verifyStorage();
    const prefix="site-media/"+target.churchId+"/";
    const response=await list({prefix,limit:100});
    return {images:response.blobs.map(b=>({
      url:b.url,pathname:b.pathname,size:b.size,uploadedAt:b.uploadedAt.toISOString(),
    })),hasMore:response.hasMore};
  }

  async upload(actor:AuthUser,file?:Express.Multer.File){
    const target=await this.scope(actor);
    this.verifyStorage();
    if(!file?.buffer || file.size<12 || file.size>MAX_BYTES)
      throw new BadRequestException("Envie uma foto JPEG, PNG ou WebP de até 3 MB.");
    const detected=detectSiteImage(file.buffer);
    if(!detected)throw new BadRequestException("Tipo de arquivo inválido. Aceitamos apenas JPEG, PNG ou WebP.");
    const key="site-media/"+target.churchId+"/"+randomUUID()+"."+detected.extension;
    // Fotos editoriais destinadas a publicação são públicas; nunca subir documentos privados.
    const uploaded=await put(key,file.buffer,{
      access:"public",contentType:detected.mime,addRandomSuffix:false,
    });
    await this.prisma.auditLog.create({data:{
      actorUserId:actor.userId,action:"site.media.upload",
      resourceType:"site_media",resourceId:key,
      organizationId:target.organizationId,churchId:target.churchId,
      metadata:{size:file.size,mime:detected.mime,sha256:createHash("sha256").update(file.buffer).digest("hex")},
    }});
    return {url:uploaded.url,pathname:key,size:file.size,mime:detected.mime};
  }
}
