import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth.constants";
import { AuthService } from "../auth.service";
import type { AuthUser } from "../types/auth-user";

/**
 * Exige Bearer de uma sessão ainda viva.
 * Assinatura válida sem sid, sessão revogada ou versão de autorização vencida
 * respondem 401. Falha do store de sessão sobe 503 (não vira acesso).
 * Rotas @Public() passam sem token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "Token JWT ausente",
        code: "SESSION_INVALID",
      });
    }

    const token = header.slice("Bearer ".length).trim();
    try {
      request.user = await this.authService.verifyAccessToken(token);
      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new UnauthorizedException({
        statusCode: 401,
        message: "Token JWT inválido",
        code: "SESSION_INVALID",
      });
    }
  }
}
