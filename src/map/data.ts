export interface MapData {
  id: string;
  n: string;
  lg: [number, number];
  img: string;
}

export const MAPS: MapData[] = [
  {
    id: 'balayan',
    n: 'Balayan, Batangas',
    lg: [0.355, 0.855],
    img: '/maps/balayan.jpg',
  },
  {
    id: 'bulacan',
    n: 'Norzagaray, Bulacan',
    lg: [0.3, 0.885],
    img: '/maps/bulacan.jpg',
  },
  {
    id: 'mariveles',
    n: 'Mariveles, Bataan',
    lg: [0.4, 0.86],
    img: '/maps/mariveles.jpg',
  },
  {
    id: 'silang',
    n: 'Silang, Cavite',
    lg: [0.38, 0.925],
    img: '/maps/silang.jpg',
  },
  {
    id: 'trece',
    n: 'Villas de Trece, Cavite',
    lg: [0.3, 0.915],
    img: '/maps/trece.jpg',
  },
  {
    id: 'tuy',
    n: 'Tuy, Batangas',
    lg: [0.715, 0.09],
    img: '/maps/tuy.jpg',
  },
];
