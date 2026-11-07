import { Controller, Get } from "@nestjs/common";
import {
  API_CONTRACT_VERSION,
  API_PATH_PREFIX,
  API_ENDPOINT_STATUS,
  APP_NAME,
  APP_SLUG,
} from "@idbrf/shared";
import { Public } from "../auth/decorators/public.decorator";

@Controller("meta")
export class MetaController {
  /** Contrato e capacidade da API — útil para o FE detectar versão. */
  @Public()
  @Get()
  getMeta() {
    return {
      app: APP_NAME,
      slug: APP_SLUG,
      contractVersion: API_CONTRACT_VERSION,
      apiPathPrefix: API_PATH_PREFIX,
      pilot: true,
      endpoints: API_ENDPOINT_STATUS,
      hmlPublicUrl: process.env.HML_PUBLIC_API_URL?.trim() || null,
      notes: [
        "Dados fictícios em DEV/HML",
        "HML_PUBLIC_API_URL só após autorização de publicação",
        "0.6.0-f6: multi-igreja BE (grants/switch/audit org-wide/indicadores stub); produto default RF1",
        "0.7.1-vivi: assistente Riachinho (rotas /vivi/*; Manus Forge default + Gemini opcional); chaves só no backend",
        "0.7.2-f2: fechamento F2 — login audit, cancel admissão, delete documentos, polish contratos",
        "0.7.3-das-etapa3: RF-013 roster publish/close + RF-018 bank-line match/unmatch; RF-001 candidatos/dedupe + photo stub; RF-006 PDF cartas; OIDC_NOT_LIVE / MFA challenge notes",
      ],
    };
  }
}
