import { pastoralZone } from "@/lib/pastoral/config";

export type PastoralOutreachCopyCandidate = {
  company: string;
  industry?: string;
  region?: string;
};

export function buildPastoralInitialOutreachBody(
  candidate: PastoralOutreachCopyCandidate,
) {
  const companyReference = buildCompanyReference(candidate);

  return [
    `Estimado equipo de ${candidate.company}:`,
    "",
    "Junto con saludar, me presento. Mi nombre es Sebastián Witting y soy jefe de Finanzas de Trabajo País, proyecto de la Pastoral de la Pontificia Universidad Católica de Chile.",
    "",
    "Trabajo País es un voluntariado que desde 2006 convoca a jóvenes universitarios para trabajar junto a comunidades vulnerables de Chile, construyendo espacios de encuentro comunitario a partir de necesidades levantadas en terreno.",
    "",
    `Este invierno nuestra zona trabajará junto a la comunidad de ${pastoralZone.locality}, en ${pastoralZone.commune}, Región de ${pastoralZone.region}. Cada aporte permite financiar materiales, herramientas, transporte y recursos necesarios para ejecutar el trabajo directamente en terreno.`,
    "",
    `Les escribo porque creemos que ${candidate.company} podría ser un aliado valioso para este trabajo. ${companyReference} La colaboración puede ser mediante una donación, apoyo en materiales o algún aporte institucional.`,
    "",
    "Nos gustaría presentarles brevemente el proyecto y evaluar si existe una forma de colaboración que tenga sentido para ustedes. Contamos con información formal sobre beneficios tributarios, detallada en la carta adjunta.",
    "",
    "¿Podríamos coordinar una llamada breve esta semana o nos podrían derivar con la persona correcta?",
    "",
    "Saludos,",
    "Sebastián Witting",
    "Jefe de Finanzas - Trabajo País UC 2026",
  ].join("\n");
}

function buildCompanyReference(candidate: PastoralOutreachCopyCandidate) {
  const industry = normalize(candidate.industry);
  const region = normalize(candidate.region);

  if (regionIncludesLocalContext(region)) {
    return `Su presencia en la zona centro-sur hace especialmente relevante explorar una colaboración con una comunidad rural de ${pastoralZone.commune} e Itata.`;
  }

  if (matches(industry, ["fundacion", "sostenibilidad", "impacto"])) {
    return "Por su trabajo en sostenibilidad, alianzas o impacto social, vemos una oportunidad concreta de conectar recursos institucionales con una comunidad que los necesita en terreno.";
  }

  if (matches(industry, ["alimento", "agro", "agricultura", "vitivin", "vino"])) {
    return "Por su vínculo con alimentos, agricultura o territorios rurales, vemos una oportunidad natural de apoyar directamente a una comunidad de Ñuble.";
  }

  if (matches(industry, ["salud", "health", "bienestar", "farm"])) {
    return "Por su trabajo en salud y bienestar, creemos que esta iniciativa puede ser una forma concreta de aportar al desarrollo comunitario desde una mirada humana y territorial.";
  }

  if (matches(industry, ["tecnolog", "innovacion", "software", "robot"])) {
    return "Por su trabajo en tecnología e innovación aplicada, creemos que una colaboración social puede transformar capacidades reales en impacto concreto para una comunidad rural.";
  }

  if (
    matches(industry, [
      "mineria",
      "industrial",
      "industria",
      "energia",
      "logistica",
      "ingenieria",
      "construccion",
    ])
  ) {
    return "Por su experiencia industrial y capacidad de movilizar recursos, redes o materiales, creemos que podrían aportar de manera muy concreta al trabajo en terreno.";
  }

  if (matches(industry, ["turismo", "hotel", "outdoor"])) {
    return "Por su relación con experiencias, territorio y comunidades locales, creemos que podrían aportar una mirada especialmente útil a un proyecto que busca fortalecer espacios comunitarios.";
  }

  return `Vemos una oportunidad concreta de vincular su trabajo con una iniciativa universitaria que busca fortalecer a la comunidad de ${pastoralZone.locality}, en ${pastoralZone.commune}.`;
}

function regionIncludesLocalContext(region: string) {
  return matches(region, ["nuble", "maule", "biobio", "itata"]);
}

function matches(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
