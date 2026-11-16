export const productionApiOrigin = "https://api.igrejadeusrf1.com.br";
export const productionWebOrigin = "https://igrejadeusrf1.com.br";

export function hasEnabledLoginForm(html) {
  const forms = html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi);
  return [...forms].some(([, form]) =>
    /<input\b[^>]*\btype="email"/i.test(form) &&
    /<input\b[^>]*\btype="password"/i.test(form) &&
    [...form.matchAll(/<button\b[^>]*>/gi)].some(([tag]) =>
      /\stype="submit"/i.test(tag) && !/\s(?:disabled(?=[\s=>])|aria-disabled="true")/i.test(tag),
    ),
  );
}
