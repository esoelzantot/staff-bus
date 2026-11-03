/**
 * Shared drawing helpers for the PDFs (A4, J&T palette). jsPDF's built-in fonts only cover Latin, so Arabic text is
 * drawn by the browser on a canvas and embedded as an image (see drawText).
 */
import type { jsPDF } from 'jspdf';
import { makeError } from '../errors';

export const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const NON_ASCII = /[^\u0000-\u007F]/;
const FONT_STACK = `"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif`;
export type Rgb = [number, number, number];
export const INK: Rgb = [29, 29, 34];
export const MUTED: Rgb = [110, 109, 118];
export const IN_COLOR: Rgb = [20, 120, 70];
export const OUT_COLOR: Rgb = [159, 18, 25];
export const HEADER_FILL: Rgb = [244, 244, 246];
export const ZEBRA_FILL: Rgb = [250, 250, 251];

export interface TextStyle {
  size?: number;
  bold?: boolean;
  color?: Rgb;
}

/**
 * jsPDF's built-in fonts only cover Latin. Text with Arabic (or any non-ASCII) characters is shaped by the
 * browser on a canvas and embedded as a crisp image; ASCII text stays real, selectable PDF text.
 * Returns the drawn width so callers can continue on the same line.
 */
export function drawText(doc: jsPDF, text: string, x: number, y: number, style: TextStyle = {}): number {
  const { size = 11, bold = false, color = INK } = style;

  if (!NON_ASCII.test(text)) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(text, x, y);
    return doc.getTextWidth(text);
  }

  const scale = 4;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw makeError('pdf');
  const font = `${bold ? '700' : '400'} ${size * scale}px ${FONT_STACK}`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 4;
  const height = Math.ceil(size * 1.6 * scale);
  canvas.width = width;
  canvas.height = height;
  ctx.font = font; // resizing a canvas resets its state
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = `rgb(${color.join(',')})`;
  ctx.fillText(text, 2, size * 1.2 * scale);
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y - size * 1.2, width / scale, height / scale);
  return width / scale;
}

export function drawLabelled(doc: jsPDF, label: string, value: string, y: number) {
  const w = drawText(doc, `${label}  `, PAGE.margin, y, { size: 11, bold: true, color: MUTED });
  drawText(doc, value, PAGE.margin + Math.max(w, 78), y, { size: 11 });
}

/** "Page 1 of 2" at the bottom right of every page. */
export function drawPageNumbers(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    drawText(doc, `Page ${page} of ${pages}`, PAGE.width - PAGE.margin - 58, PAGE.height - 28, { size: 9, color: MUTED });
  }
}
