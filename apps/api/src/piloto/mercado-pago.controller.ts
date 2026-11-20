import { Body, Controller, Headers, Param, Post, Req } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { MercadoPagoService } from "./mercado-pago.service";

@Controller()
export class MercadoPagoController {
  constructor(private readonly payments: MercadoPagoService) {}

  @Roles(ROLE_CODES.MEMBRO, ROLE_CODES.CONVIDADO, ROLE_CODES.TESOURARIA)
  @Post("member-events/registrations/:registrationId/mercado-pago/checkout")
  checkout(@CurrentUser() actor: AuthUser, @Param("registrationId") registrationId: string) {
    return this.payments.checkout(actor, registrationId);
  }

  @Public()
  @Post("webhooks/mercado-pago")
  webhook(
    @Headers("x-mp-timestamp") timestamp = "",
    @Headers("x-mp-signature") signature = "",
    @Body() body: unknown,
    @Req() request: { rawBody?: Buffer },
  ) {
    const rawBody = request.rawBody?.toString("utf8") ?? JSON.stringify(body);
    return this.payments.handleWebhook({ rawBody, timestamp, signature });
  }
}
