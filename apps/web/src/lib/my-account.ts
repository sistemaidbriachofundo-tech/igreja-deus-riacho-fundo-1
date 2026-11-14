import { apiGet, apiGetBlob, apiPatch, apiPost, apiPutForm, ApiRequestError } from "./api";

const ACCOUNT_PATH = "/account/me";
export const MY_PROFILE_PHOTO_PATH = `${ACCOUNT_PATH}/photo`;
export const PROFILE_PHOTO_TYPES = "image/jpeg,image/png,image/webp";
export const PROFILE_PHOTO_LIMIT = 5 * 1024 * 1024;
// Leave room for multipart overhead in the hosted API's 4.5 MB request limit.
const PROFILE_PHOTO_UPLOAD_LIMIT = 4 * 1024 * 1024;
const PROFILE_PHOTO_MAX_SIDE = 1600;

export type MyAccount = {
  name: string | null;
  email: string;
  phone: string | null;
  photoPath: string | null;
  canEditProfilePhoto: boolean;
  canEditPhone?: boolean;
};

export function readMyAccount(token: string) {
  return apiGet<MyAccount>(ACCOUNT_PATH, token);
}

export function saveMyPhone(token: string, phone: string) {
  return apiPatch<MyAccount>(ACCOUNT_PATH, token, { phone: phone.trim() || null });
}

export function changeMyPassword(token: string, currentPassword: string, newPassword: string) {
  return apiPost<void>(`${ACCOUNT_PATH}/password`, token, { currentPassword, newPassword });
}

export async function readMyPhoto(token: string, path: string) {
  // The session token is only ever sent to the fixed first-party photo endpoint.
  if (path !== MY_PROFILE_PHOTO_PATH) throw new Error("Rota de foto inválida.");
  const photo = await apiGetBlob(MY_PROFILE_PHOTO_PATH, token);
  const error = profilePhotoProblem(photo);
  if (error) throw new Error(error);
  return photo;
}

export async function saveMyPhoto(token: string, photo: File) {
  const error = profilePhotoProblem(photo);
  if (error) throw new Error(error);
  const upload = photo.size > PROFILE_PHOTO_UPLOAD_LIMIT ? await resizePhotoForUpload(photo) : photo;
  const form = new FormData();
  form.set("photo", upload);
  return apiPutForm(MY_PROFILE_PHOTO_PATH, token, form);
}

async function resizePhotoForUpload(photo: File): Promise<File> {
  const bitmap = await createImageBitmap(photo);
  try {
    const scale = Math.min(1, PROFILE_PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Não foi possível preparar a foto.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const resized = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!resized || resized.type !== "image/jpeg" || resized.size > PROFILE_PHOTO_UPLOAD_LIMIT) {
      throw new Error("Não foi possível reduzir a foto.");
    }
    return new File([resized], "foto-de-perfil.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export function profilePhotoProblem(photo: Blob): string | null {
  if (!PROFILE_PHOTO_TYPES.split(",").includes(photo.type)) return "Escolha uma foto JPG, PNG ou WebP.";
  if (photo.size === 0) return "A foto está vazia. Escolha outro arquivo.";
  if (photo.size > PROFILE_PHOTO_LIMIT) return "A foto deve ter até 5 MB.";
  return null;
}

export function newPasswordProblem(current: string, next: string, confirmation: string): string | null {
  if (!current) return "Informe a senha atual.";
  if (next.length < 14 || next.length > 128) return "Use entre 14 e 128 caracteres.";
  if (/\s/.test(next) || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/\d/.test(next)) {
    return "Use letras maiúsculas, minúsculas e números, sem espaços.";
  }
  if (next === current) return "Escolha uma senha diferente da atual.";
  if (next !== confirmation) return "A confirmação precisa ser igual à nova senha.";
  return null;
}

export function accountProblem(error: unknown, action: "load" | "phone" | "photo" | "password"): string {
  const status = error instanceof ApiRequestError ? error.status : null;
  if (status === 403) return "Seu acesso não permite esta ação. Se precisar, fale com a Secretaria.";
  if (status === 404 || status === 405 || status === 501) return "Este recurso ainda não está disponível neste ambiente.";
  if (status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (action === "photo" && status === 413) return "A foto deve ter até 5 MB.";
  if (status === 400 || status === 422) {
    if (action === "password") return "Confira a senha atual e os requisitos da nova senha.";
    if (action === "phone") return "Confira o telefone e inclua o DDD.";
    if (action === "photo") return "O arquivo não pôde ser usado como foto. Escolha outra imagem.";
  }
  return action === "load" ? "Não foi possível carregar sua conta. Tente novamente." : "Não foi possível salvar. Tente novamente.";
}
