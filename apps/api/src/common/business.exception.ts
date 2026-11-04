import { HttpException, HttpStatus } from "@nestjs/common";

/** Erro de negócio com `code` estável para o FE (contrato ApiError). */
export class BusinessException extends HttpException {
  constructor(
    message: string,
    code: string,
    status: HttpStatus | number = HttpStatus.CONFLICT,
  ) {
    const statusCode = Number(status);
    super(
      {
        statusCode,
        message,
        error: HttpStatus[statusCode] ?? "Error",
        code,
      },
      statusCode,
    );
  }
}
