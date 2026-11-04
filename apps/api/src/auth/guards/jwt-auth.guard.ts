import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth.constants";
import { AuthService } from "../auth.service";
import type { AuthUser } from "../types/auth-user";

/**
 * Stub JWT: valida Bearer token via AuthService.verifyAccessToken.
 * Rotas @Public() passam sem token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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
      throw new UnauthorizedException("Token JWT ausente");
    }

    const token = header.slice("Bearer ".length).trim();
    try {
      request.user = this.authService.verifyAccessToken(token);
      return true;
    } catch {
      throw new UnauthorizedException("Token JWT inválido");
    }
  }
}
