import { Body, Controller, Header, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { ParticipantScanService } from "./participant-scan.service";

class ScanBody {
  @IsString() @MinLength(8) code!: string;
}

class GrantBody {
  @IsString() @MinLength(1) userId!: string;
}

@Controller("events")
export class ParticipantScanController {
  constructor(private readonly scans: ParticipantScanService) {}

  @Roles(ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.PLATFORM_ADMIN, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR)
  @Post(":eventId/scanners")
  grant(@CurrentUser() actor: AuthUser, @Param("eventId") eventId: string, @Body() body: GrantBody) {
    return this.scans.grant(actor, eventId, body.userId);
  }

  @Roles(ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.MEMBRO, ROLE_CODES.CONVIDADO, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Post(":eventId/tickets/scan")
  @Header("Cache-Control", "private, no-store")
  scan(@CurrentUser() actor: AuthUser, @Param("eventId") eventId: string, @Body() body: ScanBody) {
    return this.scans.scan(actor, eventId, body.code);
  }
}
