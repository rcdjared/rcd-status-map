import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Setup PDF worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export interface ProcessedMapFile {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  format: 'pdf' | 'png' | 'jpg' | 'webp' | 'image';
}

/**
 * Checks if a file is a PDF based on MIME type or filename extension.
 */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Checks if a file is a supported map format (PDF, PNG, JPG, JPEG, WEBP, SVG).
 */
export function isSupportedMapFormat(file: File): boolean {
  const ext = file.name.toLowerCase();
  return (
    isPdfFile(file) ||
    file.type.startsWith('image/') ||
    ext.endsWith('.png') ||
    ext.endsWith('.jpg') ||
    ext.endsWith('.jpeg') ||
    ext.endsWith('.webp') ||
    ext.endsWith('.svg')
  );
}

/**
 * Renders the first page of a PDF document onto an off-screen HTML canvas at high resolution,
 * filling a clean white background so that CAD / blueprint lines can be flood-filled properly.
 */
export async function convertPdfToImage(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ProcessedMapFile> {
  if (onProgress) onProgress('Reading PDF blueprint…');
  const buffer = await file.arrayBuffer();

  if (onProgress) onProgress('Parsing PDF pages…');
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);

  if (onProgress) onProgress('Rendering high-resolution map…');
  const unscaledViewport = page.getViewport({ scale: 1 });

  // Target high resolution (at least 2400px width or 2x original) for crisp lot boundaries
  const targetWidth = Math.max(2400, unscaledViewport.width * 2);
  const scale = targetWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to initialize 2D context for PDF rendering');
  }

  // White background for blueprints with transparent canvas backgrounds
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  }).promise;

  if (onProgress) onProgress('Processing image data…');
  const dataUrl = canvas.toDataURL('image/png', 0.95);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to convert PDF canvas to image blob'));
      },
      'image/png',
      0.95
    );
  });

  return {
    blob,
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    format: 'pdf',
  };
}

/**
 * Loads an image file (PNG, JPG, WEBP, SVG) into a data URL and measures its dimensions.
 */
export async function processImageFile(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ProcessedMapFile> {
  if (onProgress) onProgress('Reading map image…');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'image';
        const format = (['png', 'jpg', 'jpeg', 'webp'].includes(ext)
          ? ext === 'jpeg' ? 'jpg' : ext
          : 'image') as ProcessedMapFile['format'];

        resolve({
          blob: file,
          dataUrl,
          width: img.width,
          height: img.height,
          format,
        });
      };
      img.onerror = () => reject(new Error('Failed to load image file into memory.'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read file from disk.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Unified loader that accepts any supported file format (PDF, PNG, JPG, WebP)
 * and produces ready-to-use image data and a Blob.
 */
export async function processMapUploadFile(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ProcessedMapFile> {
  if (isPdfFile(file)) {
    return convertPdfToImage(file, onProgress);
  }
  return processImageFile(file, onProgress);
}
