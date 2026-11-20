import { Controller, Headers, Param, Post, Query } from "@nestjs/common";
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

  /** Contrato oficial: x-signature (ts,v1), x-request-id e query data.id. */
  @Public()
  @Post("webhooks/mercado-pago")
  webhook(
    @Headers("x-signature") signatureHeader = "",
    @Headers("x-request-id") requestId = "",
    @Query("data.id") dataId = "",
    @Query("id") id = "",
  ) {
    return this.payments.handleWebhook({ signatureHeader, requestId, dataId: dataId || id });
  }
}
