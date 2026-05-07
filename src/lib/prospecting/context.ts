export const CONTEXT_SCOPE_PREFIX = "context--";

const CONTEXT_ACRONYMS = new Set(["caa", "cdi", "uc", "sci"]);

export type ProjectContext = {
  id: string;
  name: string;
  projectCount: number;
};

export function getContextScopeId(contextName: string) {
  return `${CONTEXT_SCOPE_PREFIX}${slugifyContextName(contextName)}`;
}

export function isContextScope(scope: string) {
  return scope.startsWith(CONTEXT_SCOPE_PREFIX);
}

export function getContextSlugFromScope(scope: string) {
  return isContextScope(scope) ? scope.slice(CONTEXT_SCOPE_PREFIX.length) : "";
}

export function slugifyContextName(name: string) {
  return normalizeContextName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeContextName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatContextName(name: string) {
  const normalized = normalizeContextName(name);
  if (!normalized) return "";

  return normalized
    .split(" ")
    .map((word) => {
      if (CONTEXT_ACRONYMS.has(word)) return word.toUpperCase();
      if (word === "uandes") return "Uandes";
      if (word === "pais") return "País";
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

export function getExistingContextName(
  rawName: string,
  existingContexts: Array<{ name: string }>,
) {
  const normalized = normalizeContextName(rawName);
  const existing = existingContexts.find(
    (context) => normalizeContextName(context.name) === normalized,
  );

  return existing?.name ?? formatContextName(rawName);
}
