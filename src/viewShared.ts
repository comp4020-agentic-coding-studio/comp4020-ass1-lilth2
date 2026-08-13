// Coordinate mapping and speed-colour scale shared by both renderers (Wave
// view and Real road view) — defined once so the two views can never drift
// out of sync with each other or with the underlying RoadState. Neither
// renderer owns this: both read it.
import { PARAMS } from "./traffic";

export const VIEW_WIDTH = 900;
export const PX_PER_UNIT = VIEW_WIDTH / PARAMS.trackLength;
export const LANE_Y = [20, 100, 180];
export const LANE_HEIGHT = 60;

export function speedState(fractionOfDesired: number): "green" | "blue" | "yellow" | "red" {
  if (fractionOfDesired >= 0.85) return "green";
  if (fractionOfDesired >= 0.6) return "blue";
  if (fractionOfDesired >= 0.3) return "yellow";
  return "red";
}
