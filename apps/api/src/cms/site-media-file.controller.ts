import { Controller, Get, Header, Param, StreamableFile } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { SiteMediaService } from "./site-media.service";

/** Leitura pública só do arquivo já validado. Upload continua autenticado. */
@Controller("cms/site-media/files")
export class SiteMediaFileController {
  constructor(private readonly media: SiteMediaService) {}

  @Public()
  @Get(":churchId/:name")
  @Header("X-Content-Type-Options", "nosniff")
  @Header("Content-Disposition", "inline")
  @Header("Cache-Control", "public, max-age=300")
  async read(@Param("churchId") churchId: string, @Param("name") name: string) {
    const file = await this.media.readPublic(churchId, name);
    return new StreamableFile(file.bytes, { type: file.mime });
  }
}
