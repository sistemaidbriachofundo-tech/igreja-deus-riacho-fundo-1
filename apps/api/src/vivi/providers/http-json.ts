import {
  BadGatewayException,
  ServiceUnavailableException,
} from "@nestjs/common";

/** Remove barras finais sem regex com quantificador aberto (S8786). */
export function stripTrailingSlashes(url: string): string {
  let out = url;
  while (out.endsWith("/")) {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Redige segredos acidentais em detalhes de erro (key=, Bearer, x-goog-api-key).
 * Não altera o tipo estrutural além de strings aninhadas.
 */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/([?&]key=)[^&\s"']+/gi, "$1[REDACTED]")
      .replace(/(Bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
      .replace(/(x-goog-api-key["']?\s*[:=]\s*["']?)[^"'\s,}+]+/gi, "$1[REDACTED]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(authorization|api[_-]?key|x-goog-api-key)$/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}

export type ProviderHttpLabels = {
  unavailableMessage: string;
  unavailableCode: string;
  rejectMessage: string;
  rejectCode: string;
  /** Extrai detail do body JSON quando HTTP !ok. */
  rejectDetail?: (body: Record<string, unknown>) => unknown;
};

/**
 * POST JSON compartilhado pelos adapters Manus/Gemini —
 * evita CPD no bloco catch / json / !ok.
 */
export async function postJsonForProvider(
  fetchImpl: typeof fetch,
  url: string,
  init: {
    headers: Record<string, string>;
    body: unknown;
  },
  labels: ProviderHttpLabels,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: init.headers,
      body: JSON.stringify(init.body),
    });
  } catch (err) {
    throw new ServiceUnavailableException({
      statusCode: 503,
      message: labels.unavailableMessage,
      code: labels.unavailableCode,
      detail: redactSecrets(
        err instanceof Error ? err.message : "network_error",
      ),
    });
  }

  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const detail = labels.rejectDetail
      ? labels.rejectDetail(body)
      : (body.error ?? body);
    throw new BadGatewayException({
      statusCode: 502,
      message: labels.rejectMessage,
      code: labels.rejectCode,
      detail: redactSecrets(detail),
    });
  }

  return body;
}

export function requireNonEmptyText(
  content: string | undefined | null,
  emptyMessage: string,
  emptyCode: string,
  detail?: unknown,
): string {
  const trimmed = content?.trim() ?? "";
  if (!trimmed) {
    throw new BadGatewayException({
      statusCode: 502,
      message: emptyMessage,
      code: emptyCode,
      ...(detail !== undefined ? { detail } : {}),
    });
  }
  return trimmed;
}
