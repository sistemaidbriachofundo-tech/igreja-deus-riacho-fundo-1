import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ChurchAccessController } from "./church-access.controller";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { ScopeGuard } from "./guards/scope.guard";
import { AccessPolicyGuard } from "./guards/access-policy.guard";

@Module({
  controllers: [AuthController, ChurchAccessController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_GUARD, useClass: AccessPolicyGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
