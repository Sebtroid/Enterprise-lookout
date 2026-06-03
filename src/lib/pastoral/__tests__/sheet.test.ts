import { describe, expect, it } from "vitest";

import {
  buildPastoralSheetRow,
  findPastoralDuplicate,
  parsePastoralContactsCsv,
} from "@/lib/pastoral/sheet";

describe("pastoral sheet guard", () => {
  it("parses the shared contact sheet even when the first header is blank", () => {
    const rows = parsePastoralContactsCsv(`-,Mail de contacto,Contactado por,Estado,Comentarios
Martin Moreno,finanzas@trabajopais.cl,Consejo TP,Va a donar,Pidio reunión
Olivo Capital,ves@olivocapital.cl,Margarita Naveillan,,`);

    expect(rows).toEqual([
      {
        name: "Martin Moreno",
        email: "finanzas@trabajopais.cl",
        contactedBy: "Consejo TP",
        status: "Va a donar",
        comments: "Pidio reunión",
      },
      {
        name: "Olivo Capital",
        email: "ves@olivocapital.cl",
        contactedBy: "Margarita Naveillan",
        status: "",
        comments: "",
      },
    ]);
  });

  it("detects duplicate outreach by email, company domain, or normalized organization name", () => {
    const sheetContacts = parsePastoralContactsCsv(`-,Mail de contacto,Contactado por,Estado,Comentarios
Olivo Capital,ves@olivocapital.cl,Margarita Naveillan,,
Grupo Evans,jvillalobos@grupoevans.cl,Margarita Naveillan,,
Cencosud S.A.,,Mari Candia,,`);

    expect(
      findPastoralDuplicate({
        companyName: "Nueva Empresa",
        email: "VES@olivocapital.cl",
        sheetContacts,
      }),
    ).toMatchObject({ reason: "email", contact: { name: "Olivo Capital" } });

    expect(
      findPastoralDuplicate({
        companyName: "Empresa Distinta",
        email: "finanzas@grupoevans.cl",
        sheetContacts,
      }),
    ).toMatchObject({ reason: "domain", contact: { name: "Grupo Evans" } });

    expect(
      findPastoralDuplicate({
        companyName: "Cencosud Chile",
        email: "contacto@otraempresa.cl",
        sheetContacts,
      }),
    ).toMatchObject({ reason: "name", contact: { name: "Cencosud S.A." } });
  });

  it("blocks related brand domains instead of only exact domains", () => {
    const sheetContacts = parsePastoralContactsCsv(`-,Mail de contacto,Contactado por,Estado,Comentarios
Copec,contacto@copec.cl,Otra zona,Esperando respuesta,
Banco BICE,alianzas@bice.cl,Otra zona,Esperando respuesta,`);

    expect(
      findPastoralDuplicate({
        companyName: "Empresas Copec",
        email: "contacto@empresascopec.cl",
        sheetContacts,
      }),
    ).toMatchObject({ reason: "domain", contact: { name: "Copec" } });

    expect(
      findPastoralDuplicate({
        companyName: "Empresas COPEC Chile S.A.",
        email: "donaciones@gmail.com",
        sheetContacts,
      }),
    ).toMatchObject({ reason: "name", contact: { name: "Copec" } });

    expect(
      findPastoralDuplicate({
        companyName: "BICECORP",
        email: "contacto@bicecorp.cl",
        sheetContacts,
      }),
    ).toMatchObject({ reason: "domain", contact: { name: "Banco BICE" } });
  });

  it("builds a row compatible with the shared sheet columns", () => {
    expect(
      buildPastoralSheetRow({
        comments: "Mensaje aprobado en Enterprise Lookout.",
        contactedBy: "Sebastian Witting",
        email: "donaciones@example.cl",
        name: "Empresa Zona",
        status: "Contactado",
      }),
    ).toEqual([
      "Empresa Zona",
      "donaciones@example.cl",
      "Sebastian Witting",
      "Contactado",
      "Mensaje aprobado en Enterprise Lookout.",
      "",
    ]);
  });
});
