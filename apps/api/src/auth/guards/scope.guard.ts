import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasAccess } from "@idbrf/shared";
import { ROLES_KEY, SCOPE_KEY, type RequiredScopeMeta } from "../auth.constants";
import type { AuthUser } from "../types/auth-user";

/**
 * Stub ABAC mínimo: combina @Roles + @RequireScope e valida grants
 * contra organizationId/churchId vindos dos params da rota.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.getAllAndOverride<RequiredScopeMeta | undefined>(
      SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) {
      return true;
    }

    const roles =
      this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params?: Record<string, string>;
      query?: Record<string, string>;
    }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Usuário não autenticado");
    }

    const organizationId = readParam(
      request,
      scope.organizationIdParam ?? "organizationId",
    );
    const churchId = readParam(request, scope.churchIdParam ?? "churchId");

    const ok = hasAccess(user.grants, {
      roleCodes: roles.length ? roles : user.grants.map((g) => g.roleCode),
      organizationId,
      churchId,
    });

    if (!ok) {
      throw new ForbiddenException("Escopo insuficiente para a congregação");
    }
    return true;
  }
}

function readParam(
  request: {
    params?: Record<string, string>;
    query?: Record<string, string>;
  },
  name: string,
): string | undefined {
  return request.params?.[name] ?? request.query?.[name];
}
