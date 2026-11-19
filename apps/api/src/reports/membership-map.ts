import {
  DF_MEMBERSHIP_REGIONS, MEMBERSHIP_MAP_STATUSES,
  type MembershipMapResponse, type MembershipMapStatus,
} from "@idbrf/shared";

type MembershipRow = { status: string; person: { address: string | null } };

const MIN_REGION_COUNT = 5;
const OTHER_UFS = /^(?:ac|al|am|ap|ba|ce|es|go|ma|mg|ms|mt|pa|pb|pe|pi|pr|rj|rn|ro|rr|rs|sc|se|sp|to)$/;
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const regionByName = new Map<string, number>(DF_MEMBERSHIP_REGIONS.map(
  ([id, name]) => [normalize(name), id],
));
for (const [name, id] of [
  ["riacho fundo", 17], ["riacho fundo 1", 17], ["riacho fundo 2", 21],
  ["guara i", 10], ["guara ii", 10], ["guara 1", 10], ["guara 2", 10],
  ["areal", 20], ["sudoeste", 22], ["octogonal", 22],
  ["estrutural", 25], ["cidade estrutural", 25], ["setor complementar de industria e abastecimento", 25],
  ["sol nascente", 32], ["por do sol", 32], ["sobradinho 2", 26],
] as const) regionByName.set(name, id);

export function membershipRegionId(address: string | null): number | undefined {
  if (!address) return undefined;

  const parts = address.split(/[,;\/\r\n]+|\s+[–—-]\s+/).map(normalize);
  if (parts.some(part => OTHER_UFS.test(part))) return undefined;

  // Only match a named address component. Street names and CEP alone can be ambiguous.
  const matches = new Set(parts.flatMap(part => {
    const label = part.replace(/^(?:bairro|regiao administrativa)\s+/, "")
      .replace(/ (?:brasilia|df|distrito federal)(?: df)?$/, "");
    const id = regionByName.get(label);
    return id === undefined ? [] : [id];
  }));
  return matches.size === 1 ? matches.values().next().value : undefined;
}

export function buildMembershipMap(memberships: readonly MembershipRow[]): MembershipMapResponse {
  const result: MembershipMapResponse = {
    ACTIVE: { regions: [], pending: 0, grouped: 0 },
    INACTIVE: { regions: [], pending: 0, grouped: 0 },
    PENDING_ADMISSION: { regions: [], pending: 0, grouped: 0 },
  };
  const counts = new Map(MEMBERSHIP_MAP_STATUSES.map(status => [status, new Map<number, number>()]));
  for (const { status, person } of memberships) {
    const groupCounts = counts.get(status as MembershipMapStatus);
    if (!groupCounts) continue;
    const region = membershipRegionId(person.address);
    if (region === undefined) result[status as MembershipMapStatus].pending++;
    else groupCounts.set(region, (groupCounts.get(region) ?? 0) + 1);
  }
  for (const [status, groupCounts] of counts) {
    for (const [id, name, latitude, longitude] of DF_MEMBERSHIP_REGIONS) {
      const count = groupCounts.get(id) ?? 0;
      if (count >= MIN_REGION_COUNT) {
        result[status].regions.push({ id, name, latitude, longitude, count });
      } else {
        result[status].grouped += count;
      }
    }
    result[status].regions.sort((a, b) => b.count - a.count);
  }
  return result;
}
