import { HttpStatus } from "@nestjs/common";
import {
  isAdmissionModality,
  isAdmissionStep,
  type AdmissionModality,
  type AdmissionStep,
} from "@idbrf/shared";
import { httpError } from "../common/http-error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 160;
const MAX_TEXT = 2000;

export interface NormalizedCreateAdmission {
  personId?: string;
  displayName?: string;
  email?: string;
  householdId?: string;
  modality?: AdmissionModality;
  notes: string | null;
}

export interface NormalizedAdvanceAdmission {
  completeStep: AdmissionStep;
  modality?: AdmissionModality;
  notesProvided: boolean;
  notes: string | null;
  decision?: "APPROVE" | "REJECT";
  rejectionReason: string | null;
}

export function parseCreateAdmission(body: unknown): NormalizedCreateAdmission {
  const raw = asRecord(body);
  const personId = optionalString(raw.personId, "personId", 128);
  const displayName = optionalString(raw.displayName, "displayName", MAX_NAME);
  const emailRaw = optionalString(raw.email, "email", 254);
  const householdId = optionalString(raw.householdId, "householdId", 128);
  const notes = optionalString(raw.notes, "notes", MAX_TEXT) ?? null;

  if (!personId && !displayName) {
    throw httpError(
      HttpStatus.BAD_REQUEST,
      "displayName ou personId é obrigatório",
      "VALIDATION_ERROR",
    );
  }
  if (personId && householdId) {
    throw httpError(
      HttpStatus.BAD_REQUEST,
      "householdId só pode ser informado ao criar a pessoa",
      "VALIDATION_ERROR",
    );
  }

  let email: string | undefined;
  if (emailRaw) {
    email = emailRaw.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw httpError(HttpStatus.BAD_REQUEST, "email inválido", "VALIDATION_ERROR");
    }
  }

  let modality: AdmissionModality | undefined;
  if (raw.modality != null) {
    if (!isAdmissionModality(raw.modality)) {
      throw httpError(
        HttpStatus.BAD_REQUEST,
        "modality inválida",
        "VALIDATION_ERROR",
      );
    }
    modality = raw.modality;
  }

  return { personId, displayName, email, householdId, modality, notes };
}

export function parseAdvanceAdmission(body: unknown): NormalizedAdvanceAdmission {
  const raw = asRecord(body);
  if (!isAdmissionStep(raw.completeStep)) {
    throw httpError(
      HttpStatus.BAD_REQUEST,
      "completeStep inválido",
      "VALIDATION_ERROR",
    );
  }

  let modality: AdmissionModality | undefined;
  if (raw.modality != null) {
    if (!isAdmissionModality(raw.modality)) {
      throw httpError(
        HttpStatus.BAD_REQUEST,
        "modality inválida",
        "VALIDATION_ERROR",
      );
    }
    modality = raw.modality;
  }

  let decision: "APPROVE" | "REJECT" | undefined;
  if (raw.decision != null) {
    if (raw.decision !== "APPROVE" && raw.decision !== "REJECT") {
      throw httpError(
        HttpStatus.BAD_REQUEST,
        "decision deve ser APPROVE ou REJECT",
        "VALIDATION_ERROR",
      );
    }
    decision = raw.decision;
  }

  const notesProvided = Object.prototype.hasOwnProperty.call(raw, "notes");
  const notes = optionalString(raw.notes, "notes", MAX_TEXT) ?? null;
  const rejectionReason =
    optionalString(raw.rejectionReason, "rejectionReason", MAX_TEXT) ?? null;

  return {
    completeStep: raw.completeStep,
    modality,
    notesProvided,
    notes,
    decision,
    rejectionReason,
  };
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(HttpStatus.BAD_REQUEST, "Corpo JSON inválido", "VALIDATION_ERROR");
  }
  return body as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw httpError(
      HttpStatus.BAD_REQUEST,
      `${field} deve ser texto`,
      "VALIDATION_ERROR",
    );
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > max) {
    throw httpError(
      HttpStatus.BAD_REQUEST,
      `${field} excede ${max} caracteres`,
      "VALIDATION_ERROR",
    );
  }
  return trimmed;
}
