import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { acceptRequestId } from "@idbrf/shared/security";
import { AppModule } from "./app.module";
import { requestContext } from "./platform-security/request-context";
import { resolveTrustProxyHops } from "./platform-security/trusted-proxy";
import { assertProductionConfiguration } from "./production-config";

function headerValue(headers: Record<string, unknown>, name: string): string | undefined {
  const value = headers[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

async function bootstrap() {
  assertProductionConfiguration(process.env);
  const app = await NestFactory.create(AppModule);

  const trustProxyHops = resolveTrustProxyHops(process.env);
  if (trustProxyHops > 0) {
    const expressApp = app.getHttpAdapter().getInstance() as {
      set: (k: string, v: unknown) => void;
    };
    expressApp.set("trust proxy", trustProxyHops);
  }

  const isProd = process.env.NODE_ENV === "production";
  const corsOrigin = process.env.CORS_ORIGIN?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (isProd && (!corsOrigin || corsOrigin.length === 0)) {
    throw new Error(
      "CORS_ORIGIN é obrigatório quando NODE_ENV=production (lista CSV de origens FE)",
    );
  }
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.enableCors({
    origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Headers básicos (sem dependência extra). TLS/HTTPS fica no reverse proxy HML.
  app.use(
    (
      req: { headers?: Record<string, unknown> },
      res: {
        setHeader: (k: string, v: string) => void;
      },
      next: () => void,
    ) => {
      const requestId =
        acceptRequestId(headerValue(req.headers ?? {}, "x-request-id")) ?? randomUUID();
      res.setHeader("X-Request-Id", requestId);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
      res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      if (process.env.IDBRF_RUNTIME_STAGE === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      }
      requestContext.run({ requestId }, () => next());
    },
  );

  // Rotas na raiz (sem setGlobalPrefix) — alinhado a API_PATH_PREFIX="" / OpenAPI 0.2.1-f2
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}


void bootstrap();
