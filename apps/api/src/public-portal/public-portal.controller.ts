import { Body, Controller, Get, Header, Optional, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { EventRegistrationsService } from "../events/event-registrations.service";
import { PublicRegistrationBody } from "../events/registration.dto";
import { PublicPortalService } from "./public-portal.service";
import { SiteLayoutService } from "../cms/site-layout.service";
import { PilotService } from "../pilot/pilot.service";
import { SystemSettingsService } from "../piloto/system-settings.service";

@Controller("public")
export class PublicPortalController {
  constructor(
    private readonly portal: PublicPortalService,
    private readonly site: SiteLayoutService,
    private readonly registrations: EventRegistrationsService,
    @Optional() private readonly settings?: SystemSettingsService,
    @Optional() private readonly pilot?: PilotService,
  ) {}

  private async keepDays(now: Date) {
    if (!this.settings || !this.pilot) return 0;
    try {
      return await this.settings.getAgendaKeepDays(await this.pilot.getPilotChurch(), now);
    } catch {
      return 0;
    }
  }

  @Public()
  @Get("site-layout")
  publishedSiteLayout() {
    return this.site.published();
  }

  @Public()
  @Get("home")
  async home() {
    const payload = await this.portal.home();
    const now = new Date();
    const keepDays = await this.keepDays(now);
    return {
      ...payload,
      featuredEvents: payload.featuredEvents.filter(event => eventIsCurrent(event, +now, keepDays)),
    };
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
  async getMinistry(@Param("slug") slug: string) {
    const detail = await this.portal.getMinistryBySlug(slug);
    const now = new Date();
    const keepDays = await this.keepDays(now);
    return { ...detail, relatedEvents: detail.relatedEvents.filter(event => eventIsCurrent(event, +now, keepDays)) };
  }

  @Public()
  @Get("events")
  async listEvents() {
    const catalog = await this.portal.listEvents();
    const now = new Date();
    const keepDays = await this.keepDays(now);
    const current = catalog.events.filter(event => eventIsCurrent(event, +now, keepDays));
    const open = await this.registrations.openPublicRegistrationEvents(current.map(event => event.id), now);
    return { ...catalog, events: current.map(event => ({ ...event, registrationOpen: open.has(event.id) })) };
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

export function eventIsCurrent(event: { startsAt: string; endsAt?: string | null }, now = Date.now(), keepDays = 0) {
  const end = Date.parse(event.endsAt || event.startsAt);
  const extra = Number.isInteger(keepDays) && keepDays > 0 ? keepDays * 86_400_000 : 0;
  return Number.isFinite(end) && end + extra >= now;
}
