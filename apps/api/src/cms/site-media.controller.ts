import { BadRequestException, Controller, Get, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { SiteMediaService } from "./site-media.service";

@Roles(ROLE_CODES.SITE_EDITOR,ROLE_CODES.SITE_PUBLISHER,ROLE_CODES.SECRETARIA,ROLE_CODES.PASTOR,ROLE_CODES.PLATFORM_ADMIN)
@Controller("cms/site-media")
export class SiteMediaController {
  constructor(private readonly media:SiteMediaService){}
  @Get()
  list(@CurrentUser() user:AuthUser){return this.media.gallery(user);}
  @Post("upload")
  @UseInterceptors(FileInterceptor("file",{limits:{fileSize:3*1024*1024,files:1,fields:0}}))
  async upload(@CurrentUser() user:AuthUser,@UploadedFile() file?:Express.Multer.File){
    if(!file)throw new BadRequestException("Selecione uma fotografia para enviar.");
    return this.media.upload(user,file);
  }
}
