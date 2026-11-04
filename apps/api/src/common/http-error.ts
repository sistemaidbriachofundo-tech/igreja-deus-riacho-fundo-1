import { HttpException, HttpStatus } from "@nestjs/common";

const ERROR_NAMES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "Bad Request",
  [HttpStatus.FORBIDDEN]: "Forbidden",
  [HttpStatus.NOT_FOUND]: "Not Found",
  [HttpStatus.CONFLICT]: "Conflict",
};

/** Erro HTTP com `code` de negócio estável para o frontend. */
export function httpError(
  status: HttpStatus,
  message: string,
  code?: string,
): HttpException {
  return new HttpException(
    {
      statusCode: status,
      message,
      error: ERROR_NAMES[status] ?? "Error",
      ...(code ? { code } : {}),
    },
    status,
  );
}
