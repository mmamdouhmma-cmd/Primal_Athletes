// Mirrors primal-fitness/src/utils/constants.js GYM_PARKOUR_PROGRESS_ATTRIBUTES.
// Kept in sync manually — if the management config changes (new skill, renamed
// attribute), update both files. Two-file duplication is cheaper than threading
// a shared package through this monorepo.

export const GYM_PARKOUR_CONFIG = {
  flexibility: {
    label: "Flexibility",
    type: "flex_rating",
    items: [
      { key: "flex_front_split", label: "Front Split" },
      { key: "flex_side_split",  label: "Side Split" },
      { key: "flex_bridge",      label: "Bridge" },
    ],
  },
  strength: {
    label: "Strength",
    type: "measurement",
    items: [
      { key: "str_push_ups",  label: "Push-ups",  unit: "reps" },
      { key: "str_hang_hold", label: "Hang Hold", unit: "sec" },
      { key: "str_plank",     label: "Plank",     unit: "sec" },
    ],
  },
  skills: {
    label: "Skills",
    type: "yes_no",
    items: [
      { key: "skill_forward_roll",     label: "Forward Roll" },
      { key: "skill_backward_roll",    label: "Backward Roll" },
      { key: "skill_cartwheel",        label: "Cartwheel" },
      { key: "skill_handstand",        label: "Handstand" },
      { key: "skill_front_handspring", label: "Front Handspring" },
      { key: "skill_back_handspring",  label: "Back Handspring" },
    ],
  },
};

// True if a progress_data blob comes from the Gym/Parkour rubric. Detect by
// flex_ / skill_ prefix only — `str_` is shared with Fitness (str_back_squat,
// str_deadlift, etc.) and would mis-route every Fitness entry into the
// gym/parkour renderer (where its keys don't match → empty body).
export function isGymParkourEntry(progressData) {
  if (!progressData || typeof progressData !== "object") return false;
  return Object.keys(progressData).some(
    (k) => k.startsWith("flex_") || k.startsWith("skill_")
  );
}

const FLEX_POINTS = { weak: 1, good: 2, excellent: 3 };

// Score over RATED items only — coach can leave items blank without skewing %.
export function computeGymParkourScore(progressData) {
  let earned = 0;
  let max = 0;
  Object.entries(progressData || {}).forEach(([key, v]) => {
    if (key.startsWith("flex_")) {
      if (v === "weak" || v === "good" || v === "excellent") {
        earned += FLEX_POINTS[v];
        max += 3;
      }
    } else if (key.startsWith("skill_")) {
      if (v === true)  { earned += 1; max += 1; }
      if (v === false) { max += 1; }
    }
  });
  const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
  let level = null;
  if (max > 0) {
    if (pct <= 40)      level = "Beginner";
    else if (pct <= 70) level = "Intermediate";
    else                level = "Professional";
  }
  return { earned, max, pct, level };
}

// Color metadata for UI chips.
export const FLEX_META = {
  weak:      { label: "Weak",      color: "var(--pf-red)",   bg: "rgba(239, 68, 68, 0.12)" },
  good:      { label: "Good",      color: "var(--pf-amber)", bg: "rgba(245, 158, 11, 0.12)" },
  excellent: { label: "Excellent", color: "var(--pf-green)", bg: "rgba(34, 197, 94, 0.12)" },
};

export const LEVEL_META = {
  Beginner:     { color: "var(--pf-red)",   bg: "rgba(239, 68, 68, 0.12)", range: "0–40%" },
  Intermediate: { color: "var(--pf-amber)", bg: "rgba(245, 158, 11, 0.12)", range: "41–70%" },
  Professional: { color: "var(--pf-green)", bg: "rgba(34, 197, 94, 0.12)", range: "71–100%" },
};
