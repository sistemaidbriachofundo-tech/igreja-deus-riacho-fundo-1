import { Controller, Get } from "@nestjs/common";
import {
  API_CONTRACT_VERSION,
  API_PATH_PREFIX,
  API_ENDPOINT_STATUS,
  APP_NAME,
  APP_SLUG,
  readSourceSha,
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
      sourceSha: readSourceSha(),
      notes: [
        "Dados fictícios em DEV/HML",
        "HML_PUBLIC_API_URL só após autorização de publicação",
        "0.6.0-f6: multi-igreja BE (grants/switch/audit org-wide/indicadores stub); produto default RF1",
        "0.7.1-vivi: assistente Riachinho (rotas /vivi/*; Manus Forge default + Gemini opcional); chaves só no backend",
        "0.7.2-f2: fechamento F2 — login audit, cancel admissão, delete documentos, polish contratos",
        "0.7.3-das-etapa3: RF-013 roster publish/close + RF-018 bank-line match; RF-001 candidatos/dedupe + RF-006 PDF cartas; RF-010 discipleship stages/progress + RF-011 cell frequency; RF-020/021 inscrição/check-in/pagamento mock; RF-029 indicadores reais (stub:false); RF-023 cursos/EBD + RF-009 retenção/export pastoral + RF-030 patrimônio; RF-016…019 fundos/CC, orçamento+competência, OFX real, comprovantes; OIDC_NOT_LIVE / MFA challenge notes",
        "0.7.4-rf014: RF-014 disponibilidade/impedimentos + exceções de casal; RF-015 alertas confirm/decline/substitute via outbox mock + resend idempotente (sem WABA live)",
        "0.7.4-rf022: hospedagem/alimentação/transporte por evento + autorização formal de responsável (menor); check-in bloqueia PENDING guardian; rf022LodgingPending=false",
        "0.7.4-rf025: RF-025 device tokens + FCM mock/noop no outbox; POST/GET /channels/device-tokens; PUSH fanout; sem FCM/WABA live",
        "sourceSha identifica o commit implantado; null não é release da API HML",
      ],
    };
  }
}
