import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleCode } from "@idbrf/shared";
import { ROLES_KEY } from "../auth.constants";
import type { AuthUser } from "../types/auth-user";

/**
 * Exige que o usuário autenticado tenha ao menos um dos papéis.
 * Sem @Roles() na rota, a rota segue (JWT e a matriz A3 decidem).
 * Sem usuário: 401. Papel ausente: 403.
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
      throw new UnauthorizedException("Autenticação necessária");
    }

    const codes = new Set(user.grants.map((g) => g.roleCode));
    const allowed = required.some((role) => codes.has(role));
    if (!allowed) {
      throw new ForbiddenException("Papel insuficiente");
    }
    return true;
  }
}
