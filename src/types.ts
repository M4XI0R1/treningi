export const MUSCLES = [
  'Klatka',
  'Plecy',
  'Barki',
  'Biceps',
  'Triceps',
  'Czworogłowe',
  'Dwugłowe',
  'Pośladki',
  'Łydki',
  'Brzuch',
] as const;
export type Muscle = (typeof MUSCLES)[number];

/** Ćwiczenie w katalogu. Historia i wykresy łączą się po stałym `id`, nie po nazwie. */
export interface Exercise {
  id: string;
  name: string;
  muscle: Muscle;
}

export interface PlanExercise {
  id: string;
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
}

export interface Plan {
  id: string;
  name: string;
  exercises: PlanExercise[];
}

export interface SetEntry {
  id: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  done: boolean;
  warmup: boolean;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  /** Cel z planu, np. „4 × 5–8”; tylko do wyświetlania. */
  target?: string;
  sets: SetEntry[];
}

export interface Workout {
  id: string;
  planId: string | null;
  name: string;
  startedAt: number;
  endedAt: number;
  note: string;
  exercises: WorkoutExercise[];
}

/** Trwający trening (szkic zapisywany na bieżąco). */
export interface Draft extends Omit<Workout, 'endedAt'> {
  restEndsAt: number | null;
  restTotal: number;
}

export interface BodyWeight {
  id: string;
  date: number;
  kg: number;
}

export interface Settings {
  restSeconds: number;
  barKg: number;
  plates: number[];
  lastExportAt: number | null;
}

export interface AppData {
  exercises: Exercise[];
  plans: Plan[];
  settings: Settings;
  workouts: Workout[];
  bodyweight: BodyWeight[];
}

export interface ExportFile {
  app: 'moj-trening';
  schema: number;
  exportedAt: number;
  data: AppData;
}
