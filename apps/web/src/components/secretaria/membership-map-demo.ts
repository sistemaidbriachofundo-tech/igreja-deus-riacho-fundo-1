import type { MembershipMapResponse } from "@idbrf/shared";

const regions = [
  { id: 17, name: "Riacho Fundo I", latitude: -15.887, longitude: -48.025, active: 186, pending: 42, inactive: 107 },
  { id: 21, name: "Riacho Fundo II", latitude: -15.908, longitude: -48.049, active: 84, pending: 26, inactive: 43 },
  { id: 15, name: "Recanto das Emas", latitude: -15.9165, longitude: -48.0737, active: 51, pending: 13, inactive: 36 },
  { id: 20, name: "Areal", latitude: -15.863, longitude: -48.0311, active: 29, pending: 7, inactive: 19 },
  { id: 8, name: "Núcleo Bandeirante", latitude: -15.869, longitude: -47.9656, active: 18, pending: 4, inactive: 16 },
  { id: 12, name: "Samambaia", latitude: -15.875, longitude: -48.085, active: 14, pending: 5, inactive: 12 },
];

function group(field: "active" | "pending" | "inactive", pending: number) {
  return {
    regions: regions.map(({ id, name, latitude, longitude, [field]: count }) => ({ id, name, latitude, longitude, count })),
    pending,
    grouped: 0,
  };
}

export const demoMembershipMap: MembershipMapResponse = {
  ACTIVE: group("active", 18),
  PENDING_ADMISSION: group("pending", 3),
  INACTIVE: group("inactive", 17),
};
