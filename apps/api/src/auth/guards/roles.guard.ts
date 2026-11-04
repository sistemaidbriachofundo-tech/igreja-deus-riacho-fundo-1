import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleCode } from "@idbrf/shared";
import { ROLES_KEY } from "../auth.constants";
import type { AuthUser } from "../types/auth-user";

/**
 * Stub RBAC: exige que o usuário autenticado tenha ao menos um dos papéis.
 * Sem @Roles() na rota → libera (só JWT importa).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleCode[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Usuário não autenticado");
    }

    const codes = new Set(user.grants.map((g) => g.roleCode));
    const allowed = required.some((role) => codes.has(role));
    if (!allowed) {
      throw new ForbiddenException("Papel insuficiente");
    }
    return true;
  }
}
