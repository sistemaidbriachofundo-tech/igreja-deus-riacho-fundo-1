import { Controller, Get, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { SiteMediaService } from "./site-media.service";

/** Upload restrito aos editores autorizados; imagens finais serão públicas. */
@Roles(
  ROLE_CODES.EDITOR_SITE, ROLE_CODES.PUBLICADOR_SITE,
  ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN,
)
@Controller("cms/site-media")
export class SiteMediaController {
  constructor(private readonly media:SiteMediaService) {}

  @Get()
  list(@CurrentUser() actor:AuthUser) {
    return this.media.list(actor);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", {
    limits:{fileSize:3*1024*1024,files:1},
  }))
  upload(@CurrentUser() actor:AuthUser, @UploadedFile() file:Express.Multer.File) {
    return this.media.upload(actor,file);
  }
}
