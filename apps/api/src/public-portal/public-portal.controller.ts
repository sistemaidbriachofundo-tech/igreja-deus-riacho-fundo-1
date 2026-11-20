import { Body, Controller, Get, Header, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
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
  @Get("groups")
  listGroups() {
    return this.portal.listGroups();
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
  async listEvents() {
    const catalog = await this.portal.listEvents();
    const now = new Date();
    const current = catalog.events.filter(event => Date.parse(event.endsAt ?? event.startsAt) >= +now);
    const open = await this.registrations.openPublicRegistrationEvents(current.map(event => event.id), now);
    return { ...catalog, events: catalog.events.map(event => ({ ...event, registrationOpen: open.has(event.id) })) };
  }

  @Public()
  @Get("events/:slug")
  async getEvent(@Param("slug") slug: string) {
    const event = await this.portal.getEventBySlug(slug);
    const catalog = await this.registrations.publicCatalogForEvent(event.id);
    return { ...event, ...catalog };
  }

  @Roles(ROLE_CODES.MEMBRO, ROLE_CODES.CONVIDADO)
  @Post("events/:slug/registrations")
  @Header("Cache-Control", "private, no-store")
  createRegistration(
    @CurrentUser() actor: AuthUser,
    @Param("slug") slug: string,
    @Body() body: PublicRegistrationBody,
  ) {
    return this.registrations.createMemberRegistration(actor, slug, body);
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
