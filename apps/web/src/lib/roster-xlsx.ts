import type { MinistryEscala } from "./ministry-presentation";
import { escalaStatusLabel } from "./ministry-view";
import { assignmentStatusLabel, churchDayKey } from "./serving-rosters";

const time = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export async function rosterXlsx(
  rosters: readonly MinistryEscala[],
  ministry: string,
  moduleNames: ReadonlyMap<string, string>,
  memberNames: ReadonlyMap<string, string>,
) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const sheet = book.addWorksheet("Escalas", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Data (Brasília)", width: 17 }, { header: "Hora", width: 10 },
    { header: "Culto", width: 40 }, { header: "Ministério", width: 23 }, { header: "Módulo", width: 26 },
    { header: "Escala", width: 16 }, { header: "Posição", width: 27 },
    { header: "Setor", width: 19 }, { header: "Zona", width: 16 }, { header: "Lado", width: 16 },
    { header: "Voluntário", width: 32 }, { header: "Parceiro(a)", width: 32 }, { header: "Situação da vaga", width: 25 },
  ];
  for (const roster of rosters) {
    const day = new Date(churchDayKey(roster.serviceAt) + "T00:00:00Z");
    const [hour, minute] = time.format(new Date(roster.serviceAt)).split(":").map(Number);
    const info = [day, (hour * 60 + minute) / 1440, roster.title,
      ministry, moduleNames.get(roster.moduleId ?? "") ?? "Geral", escalaStatusLabel(roster.status)];
    if (!roster.positions?.length) sheet.addRow([...info, "", "", "", "", "", "", "Sem posições"]);
    for (const position of roster.positions ?? []) {
      const positionInfo = [...info, position.label, position.sector, position.zone, position.side];
      const assignments = position.assignments.filter(item => item.status === "PENDING" || item.status === "CONFIRMED");
      if (!assignments.length) sheet.addRow([...positionInfo, "", "", "Vaga livre"]);
      for (const item of assignments) {
        const person = item.personName || memberNames.get(item.personId) || "Voluntário escalado";
        const partner = item.partnerPersonId ? item.partnerName || memberNames.get(item.partnerPersonId) || "Parceiro escalado" : "";
        sheet.addRow([...positionInfo, person, partner, assignmentStatusLabel[item.status]]);
      }
    }
  }
  sheet.getColumn(1).numFmt = "dd/mm/yyyy";
  sheet.getColumn(2).numFmt = "hh:mm";
  sheet.autoFilter = { from: "A1", to: "M1" };
  sheet.getRow(1).eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173A30" } };
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
  });
  return new Blob([new Uint8Array(await book.xlsx.writeBuffer())], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
