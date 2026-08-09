export { TableStage, type TableStageProps } from "./TableStage";
export { SeatPlate, opponentToSeatPlateProps, type SeatPlateProps, type SeatPlateCards } from "./SeatPlate";
export { EmptySeatMarker } from "./EmptySeatMarker";
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
