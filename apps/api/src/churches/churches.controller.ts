import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { ChurchesService } from "./churches.service";

@Controller("churches")
export class ChurchesController {
  constructor(private readonly churches: ChurchesService) {}

  /** Congregações cobertas pelos grants — base do church switcher mobile. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.churches.listAccessible(user);
  }
}
