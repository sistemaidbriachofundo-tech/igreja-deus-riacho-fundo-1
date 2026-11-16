import { Global, Module } from "@nestjs/common";
import { MAIL_TRANSPORT, MailService, createMailTransport } from "./mail.service";

@Global()
@Module({
  providers: [
    MailService,
    { provide: MAIL_TRANSPORT, useFactory: () => createMailTransport(process.env) },
  ],
  exports: [MailService, MAIL_TRANSPORT],
})
export class MailModule {}
