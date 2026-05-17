export interface Occasion {
  value: string;
  label: string;
  feel: string;
  imgMale: string;
  imgFemale: string;
  from: string;
  to: string;
}

export const OCCASIONS: Occasion[] = [
  {
    value: 'Office',
    label: 'Office',
    feel: 'clean, sharp',
    imgMale:   '/occasions/male/office.png',
    imgFemale: '/occasions/female/office.png',
    from: '#08141e', to: '#1a3250',
  },
  {
    value: 'Casual Outing',
    label: 'Casual Outing',
    feel: 'cozy, laid-back',
    imgMale:   '/occasions/male/weekend.png',
    imgFemale: '/occasions/female/weekend.png',
    from: '#141008', to: '#342618',
  },
  {
    value: 'Date Night',
    label: 'Date night',
    feel: 'romantic, warm',
    imgMale:   '/occasions/male/date-night.png',
    imgFemale: '/occasions/female/date-night.png',
    from: '#2a0d18', to: '#5c1a2e',
  },
  {
    value: 'Workout',
    label: 'Workout',
    feel: 'athletic, energized',
    imgMale:   '/occasions/male/workout.png',
    imgFemale: '/occasions/female/workout.png',
    from: '#0d1a0a', to: '#1e3a14',
  },
  {
    value: 'Night Out',
    label: 'Night out',
    feel: 'bold, confident',
    imgMale:   '/occasions/male/night-out.png',
    imgFemale: '/occasions/female/night-out.png',
    from: '#080318', to: '#200848',
  },
  {
    value: 'Festive',
    label: 'Festive',
    feel: 'fun, expressive',
    imgMale:   '/occasions/male/festival.png',
    imgFemale: '/occasions/female/festival.png',
    from: '#241000', to: '#5c2c00',
  },
  {
    value: 'Wedding',
    label: 'Wedding',
    feel: 'elegant, timeless',
    imgMale:   '/occasions/male/wedding.png',
    imgFemale: '/occasions/female/wedding.png',
    from: '#181208', to: '#3e2e14',
  },
  {
    value: 'Travel',
    label: 'Travel',
    feel: 'comfortable, versatile',
    imgMale:   '/occasions/male/travel.png',
    imgFemale: '/occasions/female/travel.png',
    from: '#081a10', to: '#163c22',
  },
];
