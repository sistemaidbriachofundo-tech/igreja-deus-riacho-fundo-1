// Pontos representativos das RAs a partir dos limites oficiais do DF (Brasília Ambiental, 2025).
// https://onda.ibram.df.gov.br/server/rest/services/Territorio/Regioes_Administrativas_DF_2025/FeatureServer/0
export const DF_MEMBERSHIP_REGIONS = [
  [1, "Plano Piloto", -15.71447, -47.95858],
  [2, "Gama", -15.99975, -48.14095],
  [3, "Taguatinga", -15.80367, -48.07009],
  [4, "Brazlândia", -15.62628, -48.13499],
  [5, "Sobradinho", -15.63485, -47.78223],
  [6, "Planaltina", -15.67105, -47.53043],
  [7, "Paranoá", -15.91719, -47.55261],
  [8, "Núcleo Bandeirante", -15.87185, -47.96994],
  [9, "Ceilândia", -15.82801, -48.20140],
  [10, "Guará", -15.82915, -47.97327],
  [11, "Cruzeiro", -15.79172, -47.93747],
  [12, "Samambaia", -15.88915, -48.15272],
  [13, "Santa Maria", -16.01596, -47.95408],
  [14, "São Sebastião", -15.97423, -47.70047],
  [15, "Recanto das Emas", -15.92925, -48.13194],
  [16, "Lago Sul", -15.85350, -47.90122],
  [17, "Riacho Fundo I", -15.89463, -48.00568],
  [18, "Lago Norte", -15.72524, -47.84863],
  [19, "Candangolândia", -15.85614, -47.94607],
  [20, "Águas Claras", -15.83410, -48.02476],
  [21, "Riacho Fundo II", -15.92045, -48.02568],
  [22, "Sudoeste/Octogonal", -15.79583, -47.92673],
  [23, "Varjão", -15.70957, -47.87941],
  [24, "Park Way", -15.92721, -47.95299],
  [25, "SCIA", -15.77761, -47.99232],
  [26, "Sobradinho II", -15.59608, -47.92858],
  [27, "Jardim Botânico", -15.94498, -47.81759],
  [28, "Itapoã", -15.73942, -47.74415],
  [29, "SIA", -15.77543, -47.95555],
  [30, "Vicente Pires", -15.79163, -48.02627],
  [31, "Fercal", -15.54356, -47.88470],
  [32, "Sol Nascente e Pôr do Sol", -15.83216, -48.15389],
  [33, "Arniqueira", -15.86173, -48.01154],
  [34, "Arapoanga", -15.64693, -47.64138],
  [35, "Água Quente", -15.94420, -48.23307],
] as const;

export const MEMBERSHIP_MAP_STATUSES = ["ACTIVE", "INACTIVE", "PENDING_ADMISSION"] as const;
export type MembershipMapStatus = (typeof MEMBERSHIP_MAP_STATUSES)[number];

export type MembershipMapRegion = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  count: number;
};

export type MembershipMapGroup = {
  regions: MembershipMapRegion[];
  pending: number;
  grouped: number;
};

export type MembershipMapResponse = Record<MembershipMapStatus, MembershipMapGroup>;
