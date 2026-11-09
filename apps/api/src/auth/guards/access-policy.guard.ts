import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  classifyAccessRoute,
  currentAccessPolicyMode,
  evaluateAccess,
  type AccessAction,
  type AccessResource,
  type AuthGrant,
} from "@idbrf/shared";
import { ACCESS_POLICY_KEY, IS_PUBLIC_KEY } from "../auth.constants";
import type { RequiredAccessMeta } from "../decorators/require-access.decorator";
import type { AuthUser } from "../types/auth-user";

interface AccessHttpRequest {
  method?: string;
  path?: string;
  url?: string;
  user?: AuthUser;
  params?: Record<string, string>;
  query?: Record<string, string | undefined>;
}

/**
 * Nega rotas da matriz A3 quando o grant não cobre recurso, ação e tenant.
 * Não concede acesso que @Roles já recusou: corre depois do RolesGuard.
 * ACCESS_POLICY_MODE=legacy desliga este guard (rollback da camada HTTP).
 */
@Injectable()
export class AccessPolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (currentAccessPolicyMode() === "legacy") {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AccessHttpRequest>();
    const method = request.method ?? "GET";
    const path = request.path ?? request.url ?? "/";
    const declared = this.reflector.getAllAndOverride<RequiredAccessMeta | undefined>(
      ACCESS_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );
    const classified = classifyAccessRoute(method, path);
    const resource = declared?.resource ?? classified?.resource;
    const action = declared?.action ?? classified?.action;
    if (!resource || !action) {
      return true;
    }

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException("Autenticação necessária");
    }

    const ministryId =
      request.params?.ministryId ?? classified?.ministryId ?? null;
    const subjectPersonId =
      request.params?.personId ?? classified?.personId ?? null;
    const organizationId =
      readNamed(request, "organizationId") ?? user.organizationId ?? null;
    const churchFromRoute = readNamed(request, "churchId");
    const churchId = churchFromRoute ?? user.churchId ?? null;

    const decision = evaluateAccess(user.grants as AuthGrant[], {
      resource: resource as AccessResource,
      action: action as AccessAction,
      organizationId,
      churchId,
      ministryId,
      actorPersonId: user.personId,
      subjectPersonId,
      unknownLeader: "allow",
      relaxedTenant: !churchId,
    });

    if (!decision.allow) {
      throw new ForbiddenException(denialMessage(decision.code));
    }
    return true;
  }
}

function readNamed(
  request: AccessHttpRequest,
  name: string,
): string | null {
  const value = request.params?.[name] ?? request.query?.[name];
  return value || null;
}

function denialMessage(code: string): string {
  if (code === "TENANT_MISMATCH") {
    return "Escopo insuficiente para a congregação";
  }
  if (code === "SELF_ONLY") {
    return "Sem permissão para consultar esta pessoa";
  }
  if (code === "MINISTRY_MISMATCH") {
    return "Sem permissão neste ministério";
  }
  return "Permissão negada pela política de acesso";
}
