import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { PublicPortalService } from "./public-portal.service";
import { SiteLayoutService } from "../cms/site-layout.service";

@Controller("public")
export class PublicPortalController {
  constructor(private readonly portal: PublicPortalService, private readonly site: SiteLayoutService) {}

  @Public()
  @Get("site-layout")
  publishedSiteLayout() { return this.site.published(); }

  @Public()
  @Get("home")
  home() {
    return this.portal.home();
  }

  @Public()
  @Get("ministries")
  listMinistries() {
    return this.portal.listMinistries();
  }

  @Public()
  @Get("ministries/:slug")
  getMinistry(@Param("slug") slug: string) {
    return this.portal.getMinistryBySlug(slug);
  }

  @Public()
  @Get("events")
  listEvents() {
    return this.portal.listEvents();
  }

  @Public()
  @Get("events/:slug")
  getEvent(@Param("slug") slug: string) {
    return this.portal.getEventBySlug(slug);
  }

  @Public()
  @Get("content/:slug")
  getContent(@Param("slug") slug: string) {
    return this.portal.getContentBySlug(slug);
  }
}
