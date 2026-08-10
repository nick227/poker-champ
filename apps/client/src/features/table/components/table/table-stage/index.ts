export { TableStage, type TableStageProps } from "./TableStage";
export { SeatPlate, opponentToSeatPlateProps, type SeatPlateProps } from "./SeatPlate";
export type { SeatPlateCards } from "./seatPlate.types";
export { EmptySeatMarker } from "./EmptySeatMarker";
export { SeatHoleCards } from "./SeatHoleCards";
export { buildHeroPlate } from "./buildHeroPlate";
export {
  seatAnchors,
  seatAnchorNorm,
  assignOpponentsToSlots,
  clampMaxSeats,
  resolveStageLayout,
  projectPoint,
  projectRect,
  SEAT_PLATE,
  STAGE_GEOMETRY,
  STAGE_LAYOUT_NORM,
  STAGE_LAYOUT_FELT_NORM,
  type SeatAnchor,
  type StageSize,
  type ResolvedStageLayout,
} from "./stageGeometry";
