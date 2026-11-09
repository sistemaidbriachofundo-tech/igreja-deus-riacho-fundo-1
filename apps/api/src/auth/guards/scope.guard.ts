import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { currentAccessPolicyMode, hasAccess } from "@idbrf/shared";
import { ROLES_KEY, SCOPE_KEY, type RequiredScopeMeta } from "../auth.constants";
import type { AuthUser } from "../types/auth-user";

/**
 * Combina @Roles + @RequireScope e valida grants contra org/igreja
 * (e ministryId quando a rota declara o param).
 * Sem papéis no modo estrito a rota fecha: não herda qualquer papel do token.
 * ACCESS_POLICY_MODE=legacy restaura esse fallback.
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
      throw new UnauthorizedException("Autenticação necessária");
    }

    const mode = currentAccessPolicyMode();
    const roleCodes =
      roles.length > 0
        ? roles
        : mode === "legacy"
          ? user.grants.map((g) => g.roleCode)
          : [];
    if (roleCodes.length === 0) {
      throw new ForbiddenException("Rota com escopo sem papéis exigidos");
    }

    const organizationId = readParam(
      request,
      scope.organizationIdParam ?? "organizationId",
    );
    const churchId = readParam(request, scope.churchIdParam ?? "churchId");
    const ministryId = scope.ministryIdParam
      ? readParam(request, scope.ministryIdParam)
      : undefined;

    const ok = hasAccess(user.grants, {
      roleCodes,
      organizationId,
      churchId,
      ministryId,
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
