export const MAX_SECONDS = 3600;

export function clampWhole(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeRoutine(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.exercises)) {
    throw new Error("This file is not a Wapp routine.");
  }
  const settings = input.settings || {};
  const exercises = input.exercises.map((exercise, index) => {
    if (!exercise || typeof exercise.name !== "string" || !exercise.name.trim()) {
      throw new Error(`Exercise ${index + 1} needs a name.`);
    }
    const sides = exercise.sides === "both" ? "both" : "none";
    return {
      id: String(exercise.id || `exercise-${index + 1}`),
      name: exercise.name.trim().slice(0, 80),
      seconds: clampWhole(exercise.seconds, 1, MAX_SECONDS),
      sets: clampWhole(exercise.sets, 1, 20),
      sides
    };
  });
  if (!exercises.length) throw new Error("Add at least one exercise.");
  return {
    version: 1,
    name: String(input.name || "My stretch routine").trim().slice(0, 80),
    settings: {
      sideSwitchSeconds: clampWhole(settings.sideSwitchSeconds, 0, 300),
      betweenExercisesSeconds: clampWhole(settings.betweenExercisesSeconds, 0, 300),
      betweenSetsSeconds: clampWhole(settings.betweenSetsSeconds, 0, 600)
    },
    exercises
  };
}

export function buildTimeline(routine) {
  const steps = [];
  const { exercises, settings } = normalizeRoutine(routine);
  exercises.forEach((exercise, exerciseIndex) => {
    for (let set = 1; set <= exercise.sets; set++) {
      const sides = exercise.sides === "both" ? ["Left", "Right"] : [null];
      sides.forEach((side, sideIndex) => {
        steps.push({
          kind: "stretch", exerciseId: exercise.id, exerciseIndex,
          name: exercise.name, side, set, sets: exercise.sets,
          seconds: exercise.seconds
        });
        if (sideIndex < sides.length - 1 && settings.sideSwitchSeconds) {
          steps.push({ kind: "rest", name: "Switch sides", seconds: settings.sideSwitchSeconds });
        }
      });
      if (set < exercise.sets && settings.betweenSetsSeconds) {
        steps.push({ kind: "rest", name: "Set break", seconds: settings.betweenSetsSeconds });
      }
    }
    if (exerciseIndex < exercises.length - 1 && settings.betweenExercisesSeconds) {
      steps.push({ kind: "rest", name: "Next stretch", seconds: settings.betweenExercisesSeconds });
    }
  });
  return steps;
}

export function formatTime(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function totalSeconds(steps) {
  return steps.reduce((sum, step) => sum + step.seconds, 0);
}
