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

function decodeImage(src: string, crossOrigin?: 'anonymous'): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) {
      img.crossOrigin = crossOrigin;
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode map image'));
    img.src = src;
  });
}

/**
 * Loads a map image so it can be drawn and then read with getImageData.
 * Remote URLs are fetched as blobs first; otherwise the canvas is tainted by
 * cross-origin data and flood-fill / barrier detection throws a SecurityError.
 */
export async function loadMapImage(src: string): Promise<HTMLImageElement> {
  if (!src) {
    throw new Error('Map image URL is empty');
  }

  const isInline = src.startsWith('data:') || src.startsWith('blob:');
  const isRemote = /^https?:\/\//i.test(src);

  if (!isInline && isRemote) {
    try {
      const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) {
        throw new Error(`Map image request failed (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await decodeImage(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (fetchErr) {
      // Host may still send ACAO on <img> even if fetch CORS failed.
      try {
        return await decodeImage(src, 'anonymous');
      } catch {
        throw fetchErr instanceof Error
          ? fetchErr
          : new Error('Failed to load map image');
      }
    }
  }

  return decodeImage(src);
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
 * Calculates zoom level and initial pan offset to fit the map completely
 * within the stage viewport (both width and height) and center it with padding.
 */
export function fitMap(
  stageWidth: number,
  stageHeight: number,
  mapWidth: number,
  mapHeight: number,
  padding = 24
): { zoom: number; panX: number; panY: number } {
  const availableW = Math.max(80, stageWidth - padding * 2);
  const availableH = Math.max(80, stageHeight - padding * 2);
  const zoom = Math.min(availableW / mapWidth, availableH / mapHeight);
  const renderedW = mapWidth * zoom;
  const renderedH = mapHeight * zoom;
  const panX = Math.round((stageWidth - renderedW) / 2);
  const panY = Math.round((stageHeight - renderedH) / 2);
  return { zoom, panX, panY };
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
  return Math.min(Math.max(currentZoom * factor, fit * 0.4), fit * 8);
}

/**
 * Applies the zoom level by setting the CSS dimensions on the map container box element.
 */
export function applyZoom(
  boxElement: HTMLElement,
  mapWidth: number,
  zoomLevel: number,
  mapHeight?: number
): void {
  boxElement.style.width = `${Math.round(mapWidth * zoomLevel)}px`;
  if (mapHeight) {
    boxElement.style.height = `${Math.round(mapHeight * zoomLevel)}px`;
  }
}

/**
 * Applies 2D translation (panning in all directions) on the map container box element.
 */
export function applyTransform(
  boxElement: HTMLElement,
  panX: number,
  panY: number
): void {
  boxElement.style.transform = `translate3d(${Math.round(panX)}px, ${Math.round(panY)}px, 0)`;
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
 * Zooms smoothly toward an arbitrary viewport coordinate point (e.g. mouse cursor or pinch midpoint),
 * keeping the exact point under the cursor stationary while updating panX and panY in all directions.
 */
export function zoomAtCursor(
  factor: number,
  cursorX: number,
  cursorY: number,
  currentZoom: number,
  panX: number,
  panY: number,
  stageElement: HTMLElement,
  _mapWidth: number,
  _mapHeight: number
): { zoom: number; panX: number; panY: number } {
  const stageRect = stageElement.getBoundingClientRect();
  const relX = cursorX - stageRect.left;
  const relY = cursorY - stageRect.top;

  const minZoom = 0.05;
  const maxZoom = 15;
  const newZoom = Math.min(Math.max(currentZoom * factor, minZoom), maxZoom);

  if (Math.abs(newZoom - currentZoom) < 0.0001) {
    return { zoom: currentZoom, panX, panY };
  }

  // Anchor equation:
  // relX - newPanX = (relX - panX) * (newZoom / currentZoom)
  const ratio = newZoom / currentZoom;
  const newPanX = relX - (relX - panX) * ratio;
  const newPanY = relY - (relY - panY) * ratio;

  return { zoom: newZoom, panX: newPanX, panY: newPanY };
}

/**
 * Smoothly zooms the map towards a specific viewport coordinate point (e.g. mouse cursor position),
 * maintaining the point under the cursor unchanged.
 */
export function zoomAtPoint(
  factor: number,
  cursorX: number,
  cursorY: number,
  currentZoom: number,
  stageElement: HTMLElement,
  boxElement: HTMLElement,
  mapWidth: number
): number {
  const stageRect = stageElement.getBoundingClientRect();
  const relX = cursorX - stageRect.left;
  const relY = cursorY - stageRect.top;

  const worldX = (stageElement.scrollLeft + relX) / currentZoom;
  const worldY = (stageElement.scrollTop + relY) / currentZoom;

  const newZoom = calculateZoom(currentZoom, factor, stageElement.clientWidth, mapWidth);
  if (Math.abs(newZoom - currentZoom) < 0.0001) return currentZoom;

  applyZoom(boxElement, mapWidth, newZoom);

  stageElement.scrollLeft = worldX * newZoom - relX;
  stageElement.scrollTop = worldY * newZoom - relY;

  return newZoom;
}

/**
 * Creates pan/drag state on mouse or touch down.
 */
export function createPanState(
  e: PointerEvent,
  stageElement: HTMLElement
): PanDragState | null {
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
 * Returns true if the pointer has moved beyond the threshold.
 */
export function handlePanMove(
  state: PanDragState,
  e: PointerEvent,
  stageElement: HTMLElement
): boolean {
  const dx = e.clientX - state.startX;
  const dy = e.clientY - state.startY;

  if (Math.abs(dx) + Math.abs(dy) > 4) {
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
