import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { ViviService } from "./vivi.service";

class ViviMessageBody {
  @IsIn(["user", "assistant", "system"])
  role!: "user" | "assistant" | "system";

  @IsString()
  @MaxLength(2000)
  content!: string;
}

class ViviChatBody {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ViviMessageBody)
  messages!: ViviMessageBody[];

  @IsOptional()
  @IsBoolean()
  consentAiProcessing?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string | null;
}

function clientKeyFrom(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

@Controller()
export class ViviController {
  constructor(private readonly vivi: ViviService) {}

  /** Descoberta de provider / rate — útil para FE e ops. */
  @Public()
  @Get("vivi/status")
  status() {
    return this.vivi.getStatus();
  }

  /**
   * Chat público (visitante) — rate-limit forte + consentimento LGPD.
   * Sem JWT.
   */
  @Public()
  @Post("public/vivi/chat")
  chatPublic(@Body() body: ViviChatBody, @Req() req: Request) {
    return this.vivi.chatPublic(body, clientKeyFrom(req));
  }

  /**
   * Chat autenticado (staff) — rate-limit admin.
   */
  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
    ROLE_CODES.LIDER_MINISTERIO,
  )
  @Post("vivi/chat")
  chatAdmin(@CurrentUser() user: AuthUser, @Body() body: ViviChatBody) {
    return this.vivi.chatAdmin(user, body);
  }
}
