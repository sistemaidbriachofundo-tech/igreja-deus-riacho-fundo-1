import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

/** Least-privilege allocation for existing users. Never creates accounts or passwords. */
type SiteTeamRole="SITE_EDITOR"|"SITE_PUBLISHER";
const codes:SiteTeamRole[]=["SITE_EDITOR","SITE_PUBLISHER"];

@Injectable()
export class SiteTeamService {
  constructor(private readonly prisma:PrismaService,private readonly pilot:PilotService){}

  private async requireAdmin(actor:AuthUser){
    const target=await this.pilot.getPilotChurch();
    if(!hasAccess(actor.grants,{
      roleCodes:[ROLE_CODES.PLATFORM_ADMIN],
      organizationId:target.organizationId,churchId:target.churchId,
    }))throw new ForbiddenException("Somente o administrador da plataforma gerencia a equipe de edição.");
    return target;
  }

  async list(actor:AuthUser){
    const target=await this.requireAdmin(actor);
    const rows=await this.prisma.grant.findMany({
      where:{
        organizationId:target.organizationId,churchId:target.churchId,
        ministryId:null,role:{code:{in:codes}},
      },
      include:{user:{select:{id:true,email:true,status:true}},role:{select:{code:true}}},
      orderBy:{createdAt:"desc"},
      take:100,
    });
    return {team:rows.map(r=>({
      id:r.id,userId:r.userId,email:r.user.email,
      role:r.role.code,status:r.user.status,createdAt:r.createdAt.toISOString(),
    }))};
  }

  async grant(actor:AuthUser,email:string,role:SiteTeamRole){
    const target=await this.requireAdmin(actor);
    if(!codes.includes(role))throw new BadRequestException("Papel editorial inválido");
    const user=await this.prisma.user.findUnique({where:{email:email.trim().toLowerCase()},select:{id:true,status:true}});
    if(!user||user.status!=="ACTIVE")throw new NotFoundException("Usuário ativo não encontrado. Cadastre-o pelo processo de contas da igreja.");
    const roleRow=await this.prisma.role.findUnique({where:{code:role}});
    if(!roleRow)throw new NotFoundException("Papel editorial não instalado. Aplique a migração do sistema.");
    const row=await this.prisma.$transaction(async tx=>{
      const existing=await tx.grant.findFirst({where:{
        userId:user.id,roleId:roleRow.id,organizationId:target.organizationId,churchId:target.churchId,ministryId:null,
      }});
      if(existing)return existing;
      const created=await tx.grant.create({data:{
        userId:user.id,roleId:roleRow.id,organizationId:target.organizationId,churchId:target.churchId,ministryId:null,
      }});
      await tx.auditLog.create({data:{
        actorUserId:actor.userId,action:"site.team.grant",
        resourceType:"grant",resourceId:created.id,organizationId:target.organizationId,churchId:target.churchId,
        metadata:{role,userId:user.id},
      }});
      return created;
    });
    return {id:row.id,role,userId:user.id};
  }

  async revoke(actor:AuthUser,grantId:string){
    const target=await this.requireAdmin(actor);
    const item=await this.prisma.grant.findFirst({where:{
      id:grantId,organizationId:target.organizationId,churchId:target.churchId,
      ministryId:null,role:{code:{in:codes}},
    }});
    if(!item)throw new NotFoundException("Permissão editorial não encontrada");
    await this.prisma.$transaction(async tx=>{
      await tx.grant.delete({where:{id:item.id}});
      await tx.auditLog.create({data:{
        actorUserId:actor.userId,action:"site.team.revoke",
        resourceType:"grant",resourceId:item.id,organizationId:target.organizationId,churchId:target.churchId,
        metadata:{userId:item.userId},
      }});
    });
    return {revoked:true};
  }
}
