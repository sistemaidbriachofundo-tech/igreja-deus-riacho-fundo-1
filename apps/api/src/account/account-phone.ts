import { BusinessException } from "../common/business.exception";

/**
 * Telefone aceito em Minha Conta.
 * DDD brasileiro + 8 dígitos, ou DDD + 9 dígitos de celular.
 * `null` limpa. O PATCH da Secretaria continua recusando o campo.
 */
export function normalizeAccountPhone(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 20 || !/^[0-9+()\s.-]+$/.test(trimmed)) {
    throw invalidPhone();
  }
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (!/^[1-9][1-9](?:[2-8]\d{7}|9\d{8})$/.test(digits)) {
    throw invalidPhone();
  }
  return `+55${digits}`;
}

function invalidPhone(): BusinessException {
  return new BusinessException(
    "Informe um telefone com DDD, como (61) 99999-0000, ou null para limpar.",
    "ACCOUNT_PHONE_INVALID",
    400,
  );
}
