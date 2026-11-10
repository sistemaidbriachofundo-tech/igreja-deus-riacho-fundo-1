import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException,
} from "@nestjs/common";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import { put, list } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthUser } from "../auth/types/auth-user";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";

/** Fotos públicas da igreja, nunca documentos de membros, CPF ou prontuários. */
const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
const EDIT_ROLES = [
  ROLE_CODES.EDITOR_SITE, ROLE_CODES.PUBLICADOR_SITE, ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN,
];
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9-]{1,45}\.(?:jpg|png|webp|avif)$/;
const CHURCH_ID = /^[A-Za-z0-9_-]{1,80}$/;
export type SiteMediaAsset = {
  url:string; name:string; pathname:string; size:number; uploadedAt:string;
};
function fileSignature(bytes:Buffer):"image/jpeg"|"image/png"|"image/webp"|"image/avif"|null {
  if (bytes.length < 16) return null;
  if (bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) return "image/jpeg";
  if (bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP") return "image/webp";
  if (bytes.toString("ascii",4,8)==="ftyp"&&["avif","avis"].includes(bytes.toString("ascii",8,12))) return "image/avif";
  return null;
}
const extensions:Record<string,string> = {
  "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/avif":"avif",
};

@Injectable()
export class SiteMediaService {
  constructor(private readonly pilot:PilotService,private readonly prisma:PrismaService) {}

  private async scope(actor:AuthUser) {
    const pilot=await this.pilot.getPilotChurch();
    if (!hasAccess(actor.grants,{
      roleCodes:EDIT_ROLES,organizationId:pilot.organizationId,churchId:pilot.churchId,
    })) throw new ForbiddenException("Sem permissão de edição da mídia");
    return pilot;
  }
  private token():string|null {
    const v=process.env.BLOB_READ_WRITE_TOKEN?.trim();
    return v||null;
  }
  /** Disco local só quando o ambiente pede. Não substitui o Blob da HML. */
  private localRoot():string|null {
    if (process.env.SITE_MEDIA_STORAGE?.trim()!=="local") return null;
    const root=process.env.SITE_MEDIA_LOCAL_ROOT?.trim();
    return root||null;
  }
  private title(pathname:string):string {
    const file=pathname.split("/").pop()??"Imagem";
    return file.replace(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-/i,"").replace(/\.[^.]+$/,"").replace(/[-_]+/g," ").slice(0,85)||"Imagem";
  }
  private mediaResult(row:{url:string;pathname:string;size:number;uploadedAt:Date|string}):SiteMediaAsset{
    return {url:row.url,pathname:row.pathname,name:this.title(row.pathname),
      size:row.size,uploadedAt:new Date(row.uploadedAt).toISOString()};
  }
  private safeLocalPath(churchId:string,name:string):string|null {
    const root=this.localRoot();
    if (!root || !CHURCH_ID.test(churchId) || !FILE_NAME.test(name)) return null;
    const base=path.resolve(root);
    const full=path.resolve(base,churchId,name);
    if (full!==path.join(base,churchId,name)) return null;
    return full;
  }
  async list(actor:AuthUser) {
    const pilot=await this.scope(actor),token=this.token();
    if (token) {
      const prefix=`church/${pilot.churchId}/site/`;
      const result=await list({prefix,limit:100,token});
      return {
        configured:true,
        storage:"blob" as const,
        assets:result.blobs.map(row=>this.mediaResult(row)),
        hasMore:result.hasMore,
        message:result.hasMore?"Exibindo as 100 fotos mais recentes; paginação será incluída na evolução da biblioteca.":null,
      };
    }
    const root=this.localRoot();
    if (!root) return {configured:false,storage:"none" as const,assets:[] as SiteMediaAsset[],message:"Armazenamento de imagens não configurado neste ambiente"};
    const dir=path.resolve(root,pilot.churchId);
    const names=await readdir(dir).catch(()=>[] as string[]);
    const assets:SiteMediaAsset[]=[];
    for (const name of names) {
      const full=this.safeLocalPath(pilot.churchId,name);
      if (!full) continue;
      const info=await stat(full);
      if (!info.isFile()) continue;
      assets.push(this.mediaResult({
        url:`/cms/site-media/files/${pilot.churchId}/${name}`,
        pathname:`church/${pilot.churchId}/site/${name}`,
        size:info.size,
        uploadedAt:info.mtime,
      }));
    }
    assets.sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
    return {
      configured:true,
      storage:"local" as const,
      assets,
      message:"Biblioteca local deste ambiente. O Blob da HML continua com o integrador.",
    };
  }
  async upload(actor:AuthUser,file:Express.Multer.File|undefined) {
    const pilot=await this.scope(actor);
    if (!file || !Buffer.isBuffer(file.buffer)) throw new BadRequestException("Selecione um arquivo de imagem");
    if (file.size<=0||file.size>MAX_MEDIA_BYTES||file.buffer.length>MAX_MEDIA_BYTES)
      throw new BadRequestException("Foto deve ter até 3 MB");
    const actual=fileSignature(file.buffer);
    if (!actual || file.mimetype!==actual) throw new BadRequestException("Formato inválido. Envie JPG, PNG, WebP ou AVIF legítimo.");
    const clean=file.originalname.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\.[^.]+$/,"").toLowerCase().replace(/[^a-z0-9-]/g,"-")
      .replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,45)||"foto";
    const filename=`${randomUUID()}-${clean}.${extensions[actual]}`;
    const token=this.token();
    if (token) {
      const pathname=`church/${pilot.churchId}/site/${filename}`;
      const blob=await put(pathname,file.buffer,{
        access:"public",addRandomSuffix:false,contentType:actual,token,
      });
      await this.audit(actor,pilot,pathname,actual,file.size);
      return {asset:this.mediaResult({...blob,size:file.size,uploadedAt:new Date()}),configured:true,storage:"blob" as const};
    }
    const full=this.safeLocalPath(pilot.churchId,filename);
    if (!full) throw new ServiceUnavailableException("O armazenamento de mídia não está habilitado neste ambiente");
    await mkdir(path.dirname(full),{recursive:true});
    await writeFile(full,file.buffer,{flag:"wx"});
    const pathname=`church/${pilot.churchId}/site/${filename}`;
    await this.audit(actor,pilot,pathname,actual,file.size);
    return {
      asset:this.mediaResult({
        url:`/cms/site-media/files/${pilot.churchId}/${filename}`,
        pathname,size:file.size,uploadedAt:new Date(),
      }),
      configured:true,
      storage:"local" as const,
    };
  }
  async readPublic(churchId:string,name:string):Promise<{bytes:Buffer;mime:string}> {
    const full=this.safeLocalPath(churchId,name);
    if (!full) throw new NotFoundException("Imagem não encontrada");
    const bytes=await readFile(full).catch(()=>{throw new NotFoundException("Imagem não encontrada");});
    const mime=fileSignature(bytes);
    if (!mime) throw new NotFoundException("Imagem não encontrada");
    return {bytes,mime};
  }
  private async audit(actor:AuthUser,pilot:{organizationId:string;churchId:string},pathname:string,mimeType:string,byteSize:number) {
    await this.prisma.auditLog.create({data:{
      actorUserId:actor.userId,action:"site.media.upload",resourceType:"site_media",
      resourceId:pathname,organizationId:pilot.organizationId,churchId:pilot.churchId,
      metadata:{mimeType,byteSize},
    }});
  }
}
