import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewPersonIntake, type NewPersonProfile } from "./NewPersonIntake";

const profile: NewPersonProfile = {
  address: "", birthDate: "", baptismDate: "", firstAttendedOn: "", weddingDate: "",
  sex: "", isMinor: false, legalGuardianPersonId: "", householdId: "", householdLabel: "",
};

describe("cadastro preventivo da secretaria", () => {
  it("mostra o CPF opcional e o erro no campo sem repetir o número", () => {
    const html = renderToStaticMarkup(
      <NewPersonIntake
        name="Ana Souza" email="ana@example.test" document=""
        documentError="Confira o CPF. O cadastro não foi criado."
        profile={profile} families={[]} token="t" roles={["SECRETARIA"]} busy={false}
        onName={() => undefined} onEmail={() => undefined} onDocument={() => undefined} onProfile={() => undefined}
      />,
    );
    expect(html).toContain("CPF para evitar cadastro duplicado");
    expect(html).toContain('id="intake-person-document-error"');
    expect(html).toContain("role=\"alert\"");
    expect(html).toContain("O número não fica gravado");
    expect(html).not.toContain("52998224725");
  });
});
