import type { Exercise, Muscle, Plan, Settings } from './types';
import { uid } from './util';

export const DEFAULT_SETTINGS: Settings = {
  restSeconds: 120,
  barKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  lastExportAt: null,
};

export const REST_OPTIONS = [60, 90, 120, 150, 180, 240];

type Row = [name: string, muscle: Muscle, sets: number, repsMin: number, repsMax: number];

const PPUL: [string, Row[]][] = [
  [
    'Push',
    [
      ['Wyciskanie sztangi na ławce płaskiej', 'Klatka', 4, 5, 8],
      ['Wyciskanie hantli na skosie dodatnim', 'Klatka', 3, 8, 12],
      ['Wyciskanie żołnierskie', 'Barki', 3, 6, 10],
      ['Wznosy hantli bokiem', 'Barki', 3, 12, 15],
      ['Prostowanie ramion na wyciągu', 'Triceps', 3, 10, 15],
    ],
  ],
  [
    'Pull',
    [
      ['Podciąganie nachwytem', 'Plecy', 4, 6, 10],
      ['Wiosłowanie sztangą', 'Plecy', 3, 8, 10],
      ['Ściąganie drążka do klatki', 'Plecy', 3, 10, 12],
      ['Face pull', 'Barki', 3, 12, 15],
      ['Uginanie ramion ze sztangą', 'Biceps', 3, 8, 12],
    ],
  ],
  [
    'Upper',
    [
      ['Wyciskanie hantli na ławce płaskiej', 'Klatka', 3, 8, 10],
      ['Wiosłowanie hantlem', 'Plecy', 3, 8, 12],
      ['Wyciskanie hantli siedząc', 'Barki', 3, 8, 12],
      ['Uginanie ramion młotkowe', 'Biceps', 3, 10, 12],
      ['Wyciskanie francuskie', 'Triceps', 3, 10, 12],
    ],
  ],
  [
    'Lower',
    [
      ['Przysiad ze sztangą', 'Czworogłowe', 4, 5, 8],
      ['Martwy ciąg rumuński', 'Dwugłowe', 3, 8, 10],
      ['Hip thrust', 'Pośladki', 3, 8, 12],
      ['Wspięcia na palce stojąc', 'Łydki', 4, 10, 15],
      ['Unoszenie nóg w zwisie', 'Brzuch', 3, 10, 15],
    ],
  ],
];

export function defaultPlans(): { exercises: Exercise[]; plans: Plan[] } {
  const exercises: Exercise[] = [];
  const plans: Plan[] = PPUL.map(([name, rows]) => ({
    id: uid(),
    name,
    exercises: rows.map(([exName, muscle, sets, repsMin, repsMax]) => {
      const ex: Exercise = { id: uid(), name: exName, muscle };
      exercises.push(ex);
      return { id: uid(), exerciseId: ex.id, sets, repsMin, repsMax };
    }),
  }));
  return { exercises, plans };
}
