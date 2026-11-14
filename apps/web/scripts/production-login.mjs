export const productionApiOrigin = "https://api.igrejadeusrf1.com.br";
export const productionWebOrigin = "https://igrejadeusrf1.com.br";

export function hasEnabledLoginForm(html) {
  const forms = html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi);
  return [...forms].some(([, form]) =>
    /<input\b[^>]*\btype="email"/i.test(form) &&
    /<input\b[^>]*\btype="password"/i.test(form) &&
    /<button\b(?=[^>]*\s+type="submit")(?![^>]*\s+(?:disabled(?=[\s=>])|aria-disabled="true"))[^>]*>/i.test(form),
  );
}
