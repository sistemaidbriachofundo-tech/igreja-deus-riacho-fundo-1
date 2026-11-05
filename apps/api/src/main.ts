import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const isProd = process.env.NODE_ENV === "production";
  const corsOrigin = process.env.CORS_ORIGIN?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (isProd && (!corsOrigin || corsOrigin.length === 0)) {
    throw new Error(
      "CORS_ORIGIN é obrigatório quando NODE_ENV=production (lista CSV de origens FE)",
    );
  }
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
      _req: { url?: string },
      res: {
        setHeader: (k: string, v: string) => void;
      },
      next: () => void,
    ) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      next();
    },
  );

  // Rotas na raiz (sem setGlobalPrefix) — alinhado a API_PATH_PREFIX="" / OpenAPI 0.2.1-f2
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}


void bootstrap();
