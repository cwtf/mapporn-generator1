export const projections = [
  'Mercator',
  'Equal Earth',
  'Natural Earth',
  'Equirectangular',
  'Globe',
] as const;
export type Projection = (typeof projections)[number];
export type CountryStyle = { color?: string; label?: string };
export type MapState = {
  title: string;
  subtitle: string;
  projection: Projection;
  countries: Record<string, CountryStyle>;
  legend: { label: string; color: string }[];
  showLabels: boolean;
};
export const initialMap: MapState = {
  title: 'A world of possibilities',
  subtitle: 'Your next map starts here.',
  projection: 'Mercator',
  countries: {},
  legend: [],
  showLabels: false,
};
export const palette = [
  '#147d92',
  '#48a7ac',
  '#dfae52',
  '#df7861',
  '#8582bc',
  '#659667',
  '#b4c3cc',
];
export type ProviderSettings = {
  format: 'openai' | 'responses' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey: string;
};
export const initialSettings: ProviderSettings = {
  format: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
};
