export const theme = {
  colors: {
    bg: '#080B12',
    bgElevated: '#101623',
    card: '#141C2B',
    cardSoft: '#1A2436',
    border: '#243149',
    text: '#F2F6FF',
    textMuted: '#8FA0BF',
    textDim: '#5F6F8C',
    accent: '#F5A524',
    accentSoft: '#3A2A12',
    green: '#3DDC97',
    greenSoft: '#123326',
    red: '#FF6B6B',
    redSoft: '#3A1A1F',
    blue: '#5B9DFF',
    blueSoft: '#14243F',
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    full: 999,
  },
  space: (n: number) => n * 4,
  sourceColors: {
    kariyernet: '#5B9DFF',
    eleman: '#3DDC97',
    iskur: '#F5A524',
    kariyerkapisi: '#B18CFF',
    secretcv: '#FF8AB3',
    company: '#7DD3FC',
  } as Record<string, string>,
};

export const sourceLabels: Record<string, string> = {
  kariyernet: 'Kariyer.net',
  eleman: 'Eleman.net',
  iskur: 'İŞKUR',
  kariyerkapisi: 'Kariyer Kapısı',
  secretcv: 'SecretCV',
  company: 'Belediye / Şirket',
};