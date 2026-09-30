import { jsPDF } from 'jspdf';
import { COMPANY_NAME } from '../../config/constants';
import type { Employee, TripType } from '../../types';
import { formatDate, formatTime } from '../date/format';
import { makeError } from '../errors';

export interface SummaryPdfData {
  route: string;
  busNumber: string;
  tripType: TripType;
  /** yyyy-mm-dd of the trip */
  date: string;
  capacity: number;
  passengers: Employee[];
  arrivalTime: Date | null;
}

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const NON_ASCII = /[^\u0000-\u007F]/;
const FONT_STACK = `"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif`;
const INK: [number, number, number] = [14, 42, 38];
const MUTED: [number, number, number] = [100, 112, 110];

interface TextStyle {
  size?: number;
  bold?: boolean;
  color?: [number, number, number];
}

/**
 * jsPDF's built-in fonts only cover Latin. Text with Arabic (or any non-ASCII) characters is shaped by the
 * browser on a canvas and embedded as a crisp image; ASCII text stays real, selectable PDF text.
 * Returns the drawn width so callers can continue on the same line.
 */
function drawText(doc: jsPDF, text: string, x: number, y: number, style: TextStyle = {}): number {
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

function drawLabelled(doc: jsPDF, label: string, value: string, y: number) {
  const w = drawText(doc, `${label}  `, PAGE.margin, y, { size: 11, bold: true, color: MUTED });
  drawText(doc, value, PAGE.margin + Math.max(w, 70), y, { size: 11 });
}

export function generateSummaryPdf(data: SummaryPdfData): void {
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const now = new Date();
    const tripLabel = data.tripType === 'going' ? 'Going' : 'Returning';
    let y = PAGE.margin + 10;

    drawText(doc, COMPANY_NAME, PAGE.margin, y, { size: 12, color: MUTED });
    y += 28;
    drawText(doc, `Bus Passenger Summary – ${tripLabel}`, PAGE.margin, y, { size: 20, bold: true });
    y += 14;
    doc.setDrawColor(255, 196, 0);
    doc.setLineWidth(3);
    doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
    y += 28;

    const rows: [string, string][] = [
      ['Route:', data.route],
      ['Bus Number:', data.busNumber],
      ['Trip Type:', tripLabel],
      ['Date:', formatDate(data.date)],
      ['Time:', formatTime(now, 'en-US')],
    ];
    if (data.arrivalTime) rows.push(['Arrived:', formatTime(data.arrivalTime, 'en-US')]);
    for (const [label, value] of rows) {
      drawLabelled(doc, label, value, y);
      y += 20;
    }

    y += 14;
    drawText(doc, 'Passengers:', PAGE.margin, y, { size: 13, bold: true });
    y += 10;
    doc.setDrawColor(200, 206, 204);
    doc.setLineWidth(0.6);
    doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
    y += 20;

    if (data.passengers.length === 0) {
      drawText(doc, 'No passengers selected yet.', PAGE.margin, y, { color: MUTED });
      y += 20;
    }

    data.passengers.forEach((p, index) => {
      if (y > PAGE.height - PAGE.margin - 60) {
        doc.addPage();
        y = PAGE.margin + 10;
      }
      drawText(doc, `${index + 1}.`, PAGE.margin, y, { size: 11, color: MUTED });
      drawText(doc, p.name, PAGE.margin + 28, y, { size: 12 });
      drawText(doc, p.employeeId, PAGE.margin + 300, y, { size: 10, color: MUTED });
      drawText(doc, p.type === 'main' ? 'Main' : 'Waiting', PAGE.margin + 400, y, { size: 10, color: MUTED });
      y += 22;
    });

    y += 8;
    if (y > PAGE.height - PAGE.margin - 30) {
      doc.addPage();
      y = PAGE.margin + 10;
    }
    doc.setDrawColor(...INK);
    doc.setLineWidth(1);
    doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
    y += 22;
    drawText(doc, 'Total Passengers:', PAGE.margin, y, { size: 13, bold: true });
    drawText(doc, `${data.passengers.length} / ${data.capacity}`, PAGE.margin + 130, y, {
      size: 13,
      bold: true,
    });

    doc.save(`bus-summary-${data.date}-${data.tripType}.pdf`);
  } catch (err) {
    console.error(err);
    throw makeError('pdf');
  }
}
