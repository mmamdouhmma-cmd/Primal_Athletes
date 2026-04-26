// Per-discipline section structure for the athlete progress display.
// Mirrors primal-fitness/src/utils/constants.js (BJJ_/BOXING_/MUAY_THAI_/MMA_/
// FITNESS_PROGRESS_ATTRIBUTES). Manual sync — keep both in lockstep when the
// management config changes (new attribute, renamed key, reordered section).
//
// Shape: each entry is keyed by discipline_id (UUID, see disciplineMap.js on the
// management side) and holds an ordered list of { label, keys[] }. The renderer
// preserves this order so the athlete sees sections in the same flow as the coach.

const BJJ_DISCIPLINE_ID         = "40782771-f5c0-483c-8744-e94995f8dd6c";
const MUAY_THAI_DISCIPLINE_ID   = "22fa95bf-c9f3-42bc-a1f3-4be9bd93438d";
const BOXING_DISCIPLINE_ID      = "91fd2334-e58e-4b15-89cd-aa4e5ddc4d65";
const FITNESS_DISCIPLINE_ID     = "174102cb-e6f5-4bf3-bdda-079f430d1d1f";
const MMA_DISCIPLINE_ID         = "20616deb-e151-49ff-944d-6e91285dc995";

export const DISCIPLINE_SECTIONS = {
  // ── BJJ ──
  [BJJ_DISCIPLINE_ID]: [
    { label: "Top / Offense",     keys: ["full_guard_top", "half_guard_top", "side_control_top", "mount_top", "sweeps", "takedowns_offense", "submission_offense"] },
    { label: "Bottom / Defense",  keys: ["full_guard_bottom", "half_guard_bottom", "side_control_bottom", "mount_bottom", "sweeps_defense", "takedowns_defense", "submission_defense"] },
    { label: "Behavioral Rating", keys: ["composure", "listening", "focus", "understanding", "behavior"] },
  ],

  // ── Boxing ──
  [BOXING_DISCIPLINE_ID]: [
    { label: "Technical Rating",  keys: ["footwork", "blocking", "head_movement", "jab", "cross", "lead_hook", "rear_hook", "lead_uppercut", "rear_uppercut"] },
    { label: "Body Punches",      keys: ["body_jab", "body_cross", "lead_hook_body", "rear_hook_body", "lead_uppercut_body", "rear_uppercut_body"] },
    { label: "Combinations",      keys: ["combinations_fluidity"] },
    { label: "Behavioral Rating", keys: ["composure", "listening", "focus", "understanding", "behavior"] },
  ],

  // ── Muay Thai ──
  [MUAY_THAI_DISCIPLINE_ID]: [
    { label: "Offense",           keys: ["jab", "cross", "lead_hook", "rear_hook", "lead_uppercut", "rear_uppercut", "lead_kicks", "rear_kicks", "elbows", "knees"] },
    { label: "Defense",           keys: ["blocking", "checking", "head_movement", "body_punches_defense"] },
    { label: "Physical",          keys: ["conditioning", "kicking_balance", "punching_balance", "kicking_power", "punching_power", "clinch_control"] },
    { label: "Behavioral Rating", keys: ["composure", "listening", "focus", "understanding", "behavior"] },
  ],

  // ── MMA ──
  [MMA_DISCIPLINE_ID]: [
    { label: "Offense",           keys: ["punch_speed", "punch_power", "kick_speed", "kick_power", "strike_accuracy", "clinch_striking", "takedown_offense", "submission_offense", "ground_striking_offense"] },
    { label: "Defense",           keys: ["punch_defense", "kick_defense", "head_movement", "takedown_defense", "submission_defense", "ground_striking_defense"] },
    { label: "Grappling",         keys: ["clinch_grapple", "ground_grapple_top", "ground_grapple_bottom"] },
    { label: "Physical",          keys: ["strength", "speed", "cardio", "footwork"] },
    { label: "Behavioral Rating", keys: ["composure", "listening", "focus", "understanding", "behavior"] },
  ],

  // ── Fitness ──
  [FITNESS_DISCIPLINE_ID]: [
    { label: "Mobility",     keys: ["mob_ankle", "mob_hips", "mob_lats_shoulder"] },
    { label: "Stability",    keys: ["stab_knee", "stab_core", "stab_scapula_shoulder"] },
    { label: "Gymnastics",   keys: ["gym_push_ups", "gym_kipping_pull_ups", "gym_air_squats", "gym_butterfly_pull_ups", "gym_strict_pull_ups", "gym_dips", "gym_rope_climb", "gym_legless_rope_climb", "gym_box_jump", "gym_pistol_right", "gym_pistol_left", "gym_toes_to_bar", "gym_bar_muscle_up", "gym_ring_muscle_up", "gym_hspu", "gym_strict_hspu"] },
    { label: "Strength",     keys: ["str_back_squat", "str_front_squat", "str_overhead_squat", "str_deadlift", "str_power_clean", "str_power_snatch", "str_squat_clean", "str_squat_snatch", "str_clean_jerk", "str_military_press", "str_push_press", "str_push_jerk"] },
    { label: "Conditioning", keys: ["cond_500m_row", "cond_20cal_bike", "cond_20cal_ski", "cond_400m_run", "cond_5k_run"] },
    { label: "Benchmark",    keys: ["bench_fran", "bench_linda", "bench_murph"] },
  ],
};

// Returns the ordered section list for a discipline, or null if unknown
// (e.g. data from a discipline we don't have a mapping for — the renderer
// then falls back to a single bucket).
export function getDisciplineSections(disciplineId) {
  return DISCIPLINE_SECTIONS[disciplineId] || null;
}
