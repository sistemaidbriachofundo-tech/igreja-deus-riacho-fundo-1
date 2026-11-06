import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { IsEmail, IsIn } from "class-validator";
import { ROLE_CODES } from "@idbrf/shared";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { SiteTeamService } from "./site-team.service";

class SiteTeamGrantBody {
  @IsEmail()
  email!:string;

  @IsIn(["SITE_EDITOR","SITE_PUBLISHER"])
  role!:"SITE_EDITOR"|"SITE_PUBLISHER";
}

@Roles(ROLE_CODES.PLATFORM_ADMIN)
@Controller("cms/site-layout/team")
export class SiteTeamController {
  constructor(private readonly team:SiteTeamService){}
  @Get()
  list(@CurrentUser() actor:AuthUser){return this.team.list(actor);}
  @Post()
  grant(@CurrentUser() actor:AuthUser,@Body() body:SiteTeamGrantBody){return this.team.grant(actor,body.email,body.role);}
  @Delete(":grantId")
  revoke(@CurrentUser() actor:AuthUser,@Param("grantId") grantId:string){return this.team.revoke(actor,grantId);}
}
