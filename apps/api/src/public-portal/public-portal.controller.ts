import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { EventRegistrationsService } from "../events/event-registrations.service";
import { PublicRegistrationBody } from "../events/registration.dto";
import { PublicPortalService } from "./public-portal.service";
import { SiteLayoutService } from "../cms/site-layout.service";

@Controller("public")
export class PublicPortalController {
  constructor(
    private readonly portal: PublicPortalService,
    private readonly site: SiteLayoutService,
    private readonly registrations: EventRegistrationsService,
  ) {}

  @Public()
  @Get("site-layout")
  publishedSiteLayout() {
    return this.site.published();
  }

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
  async getEvent(@Param("slug") slug: string) {
    const event = await this.portal.getEventBySlug(slug);
    const catalog = await this.registrations.publicCatalogForEvent(event.id);
    return { ...event, ...catalog };
  }

  @Public()
  @Post("events/:slug/registrations")
  createRegistration(
    @Param("slug") slug: string,
    @Body() body: PublicRegistrationBody,
  ) {
    return this.registrations.createPublicRegistration(slug, body);
  }

  @Public()
  @Get("registrations/:checkInCode")
  registrationStatus(@Param("checkInCode") checkInCode: string) {
    return this.registrations.getPublicRegistrationStatus(checkInCode);
  }

  @Public()
  @Get("content/:slug")
  getContent(@Param("slug") slug: string) {
    return this.portal.getContentBySlug(slug);
  }
}
