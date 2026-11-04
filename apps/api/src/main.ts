import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
  });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

void bootstrap();
