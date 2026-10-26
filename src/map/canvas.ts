import type { MapData } from './data';
import { createBarrierMap } from './flood-fill';

export interface CanvasGroup {
  base: HTMLCanvasElement;
  fill: HTMLCanvasElement;
  pins: HTMLCanvasElement;
}

export interface MapDimensions {
  width: number;
  height: number;
  pinRadius: number;
}

export interface PanDragState {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  moved: boolean;
}

/**
 * Loads a map image asynchronously by URL.
 */
export function loadMapImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Loads a map image given a MapData object.
 */
export function loadMap(map: MapData): Promise<HTMLImageElement> {
  return loadMapImage(map.img);
}

/**
 * Sets the internal pixel buffer dimensions for all canvas layers
 * and calculates the pin radius based on map width.
 */
export function setupCanvases(
  canvases: CanvasGroup,
  imageWidth: number,
  imageHeight: number
): MapDimensions {
  const pinRadius = Math.round(imageWidth * 0.0045);
  canvases.base.width = imageWidth;
  canvases.base.height = imageHeight;
  canvases.fill.width = imageWidth;
  canvases.fill.height = imageHeight;
  canvases.pins.width = imageWidth;
  canvases.pins.height = imageHeight;

  return {
    width: imageWidth,
    height: imageHeight,
    pinRadius,
  };
}

/**
 * Draws the base map image onto the base canvas and generates the barrier bitmap.
 */
export function drawBaseMap(
  baseCanvas: HTMLCanvasElement,
  image: HTMLImageElement
): Uint8Array {
  const ctx = baseCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to get 2D context for base canvas');
  }

  ctx.drawImage(image, 0, 0);
  const imgData = ctx.getImageData(0, 0, image.width, image.height);
  return createBarrierMap(imgData.data, image.width, image.height);
}

/**
 * Calculates new zoom level given a factor, stage client width, and map width.
 * If factor is 0 (or fit is requested), returns the fit-to-width zoom level.
 */
export function calculateZoom(
  currentZoom: number,
  factor: number,
  stageClientWidth: number,
  mapWidth: number
): number {
  const fit = (stageClientWidth - 16) / mapWidth;
  if (!factor) {
    return fit;
  }
  return Math.min(Math.max(currentZoom * factor, fit * 0.6), fit * 6);
}

/**
 * Applies the zoom level by setting the CSS width on the map container box element.
 */
export function applyZoom(
  boxElement: HTMLElement,
  mapWidth: number,
  zoomLevel: number
): void {
  boxElement.style.width = `${mapWidth * zoomLevel}px`;
}

/**
 * Converts mouse/pointer event coordinates relative to the viewport into
 * actual pixel coordinates on the map image.
 */
export function screenToMapCoords(
  clientX: number,
  clientY: number,
  boxElement: HTMLElement,
  mapWidth: number,
  mapHeight: number
): { x: number; y: number } {
  const rect = boxElement.getBoundingClientRect();
  const x = Math.round(((clientX - rect.left) * mapWidth) / rect.width);
  const y = Math.round(((clientY - rect.top) * mapHeight) / rect.height);
  return { x, y };
}

/**
 * Creates pan/drag state on mouse down.
 */
export function createPanState(
  e: PointerEvent,
  stageElement: HTMLElement
): PanDragState | null {
  if (e.pointerType !== 'mouse') return null;
  return {
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: stageElement.scrollLeft,
    scrollTop: stageElement.scrollTop,
    moved: false,
  };
}

/**
 * Updates stage scroll positions during a pan drag.
 * Returns true if the pointer has moved beyond the 5px threshold.
 */
export function handlePanMove(
  state: PanDragState,
  e: PointerEvent,
  stageElement: HTMLElement
): boolean {
  const dx = e.clientX - state.startX;
  const dy = e.clientY - state.startY;

  if (Math.abs(dx) + Math.abs(dy) > 5) {
    state.moved = true;
  }

  if (state.moved) {
    stageElement.scrollLeft = state.scrollLeft - dx;
    stageElement.scrollTop = state.scrollTop - dy;
  }

  return state.moved;
}

/**
 * Creates a composite canvas of base, fill, and pin layers for exporting as a PNG image.
 */
export function compositeForExport(
  canvases: CanvasGroup,
  width: number,
  height: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context for PNG export');
  }

  ctx.drawImage(canvases.base, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.6;
  ctx.drawImage(canvases.fill, 0, 0);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(canvases.pins, 0, 0);

  return c;
}
