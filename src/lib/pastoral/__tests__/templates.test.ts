import { describe, expect, it } from "vitest";

import { pastoralMailTemplates } from "@/lib/pastoral/templates";

describe("pastoral mail templates", () => {
  it("does not mention the fundraising target in first outreach templates", () => {
    const firstOutreachTemplates = pastoralMailTemplates.filter((template) =>
      template.id.endsWith("-inicial"),
    );

    for (const template of firstOutreachTemplates) {
      expect(template.body).not.toContain("$6.000.000");
      expect(template.body).not.toMatch(/\b6\s*MM\b/i);
    }
  });

  it("keeps the local zone context in first outreach templates", () => {
    const firstOutreachTemplates = pastoralMailTemplates.filter((template) =>
      template.id.endsWith("-inicial"),
    );

    for (const template of firstOutreachTemplates) {
      expect(template.body).toContain("Los Cardones");
      expect(template.body).toContain("Ninhue");
      expect(template.body).toContain("Itata");
      expect(template.body).toContain("Ñuble");
    }
  });
});
