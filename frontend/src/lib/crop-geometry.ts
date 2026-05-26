import { getHeaderExclusionRegion, SHEET_HEADER_HEIGHT, SHEET_MARGIN } from "@/lib/answer-sheet-layout";
import type { CropRegion } from "@/types/firestore";

export const HEADER_ZONE_BOTTOM = SHEET_MARGIN + SHEET_HEADER_HEIGHT;

export function cropTouchesHeaderZone(region: CropRegion): boolean {
  if ((region.pageIndex ?? 0) !== 0) return false;
  return region.y < HEADER_ZONE_BOTTOM;
}

export function regionsOverlap(a: CropRegion, b: CropRegion): boolean {
  if ((a.pageIndex ?? 0) !== (b.pageIndex ?? 0)) return false;
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

export function cropOverlapsHeader(region: CropRegion): boolean {
  return regionsOverlap(region, getHeaderExclusionRegion(0));
}
