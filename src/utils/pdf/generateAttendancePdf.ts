import { jsPDF } from 'jspdf';
import { COMPANY_NAME } from '../../config/constants';
import type { AttendanceDay, EmployeeType } from '../../types';
import { newestFirst, summarizeAttendance } from '../attendance';
import { formatDate, formatTime, formatWeekday, todayKey } from '../date/format';
import { makeError } from '../errors';

export interface AttendancePdfData {
  /** The Employee ID is the sign-in credential, so it is deliberately not part of the data (nor of the PDF). */
  employeeName: string;
  employeeType: EmployeeType;
  route: string;
  busNumber: string;
  days: AttendanceDay[];
}

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const NON_ASCII = /[^\u0000-\u007F]/;
const FONT_STACK = `"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif`;
type Rgb = [number, number, number];
const INK: Rgb = [14, 42, 38];
const MUTED: Rgb = [100, 112, 110];
const IN_COLOR: Rgb = [20, 120, 70];
const OUT_COLOR: Rgb = [176, 42, 42];
const HEADER_FILL: Rgb = [238, 242, 241];
const ZEBRA_FILL: Rgb = [248, 250, 249];

/** Column x positions (pt). */
const COL = {
  index: PAGE.margin + 6,
  date: PAGE.margin + 46,
  day: PAGE.margin + 170,
  going: PAGE.margin + 260,
  returning: PAGE.margin + 390,
};
const ROW_HEIGHT = 22;
const FOOTER_SPACE = 44;

interface TextStyle {
  size?: number;
  bold?: boolean;
  color?: Rgb;
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
  drawText(doc, value, PAGE.margin + Math.max(w, 78), y, { size: 11 });
}

function drawTableHeader(doc: jsPDF, y: number): number {
  doc.setFillColor(...HEADER_FILL);
  doc.rect(PAGE.margin, y - 15, PAGE.width - PAGE.margin * 2, ROW_HEIGHT, 'F');
  const style = { size: 10, bold: true, color: MUTED } as const;
  drawText(doc, '#', COL.index, y, style);
  drawText(doc, 'Date', COL.date, y, style);
  drawText(doc, 'Day', COL.day, y, style);
  drawText(doc, 'Going', COL.going, y, style);
  drawText(doc, 'Returning', COL.returning, y, style);
  return y + ROW_HEIGHT;
}

/** Builds the document (no download) – kept separate so it can be tested / previewed. */
export function buildAttendancePdf(data: AttendancePdfData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const rows = newestFirst(data.days);
  const summary = summarizeAttendance(rows);
  let y = PAGE.margin + 10;

  drawText(doc, COMPANY_NAME, PAGE.margin, y, { size: 12, color: MUTED });
  y += 28;
  drawText(doc, 'Employee IN Record', PAGE.margin, y, { size: 20, bold: true });
  y += 14;
  doc.setDrawColor(255, 196, 0);
  doc.setLineWidth(3);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 28;

  const period =
    summary.from && summary.to
      ? summary.from === summary.to
        ? formatDate(summary.from)
        : `${formatDate(summary.from)}  -  ${formatDate(summary.to)}`
      : '-';
  const info: [string, string][] = [
    ['Employee:', data.employeeName],
    ['Type:', data.employeeType === 'main' ? 'Main' : 'Waiting'],
    ['Route:', data.route],
    ['Bus Number:', data.busNumber],
    ['Period:', period],
    ['Generated:', `${formatDate(todayKey())}  ${formatTime(new Date(), 'en-US')}`],
  ];
  for (const [label, value] of info) {
    drawLabelled(doc, label, value, y);
    y += 20;
  }

  // Totals
  y += 10;
  doc.setDrawColor(200, 206, 204);
  doc.setLineWidth(0.6);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 22;
  drawText(doc, `Days recorded: ${summary.days}`, PAGE.margin, y, { size: 12, bold: true });
  y += 22;
  drawText(doc, `Going - days IN: ${summary.goingIn} of ${summary.days}`, PAGE.margin, y, {
    size: 12,
    bold: true,
    color: IN_COLOR,
  });
  drawText(doc, `Returning - days IN: ${summary.returningIn} of ${summary.days}`, PAGE.margin + 230, y, {
    size: 12,
    bold: true,
    color: IN_COLOR,
  });
  y += 30;

  y = drawTableHeader(doc, y);
  if (rows.length === 0) drawText(doc, 'No records yet.', PAGE.margin + 6, y, { color: MUTED });

  rows.forEach((day, index) => {
    if (y > PAGE.height - PAGE.margin - FOOTER_SPACE) {
      doc.addPage();
      y = drawTableHeader(doc, PAGE.margin + 10);
    }
    if (index % 2 === 1) {
      doc.setFillColor(...ZEBRA_FILL);
      doc.rect(PAGE.margin, y - 15, PAGE.width - PAGE.margin * 2, ROW_HEIGHT, 'F');
    }
    drawText(doc, String(index + 1), COL.index, y, { size: 10, color: MUTED });
    drawText(doc, formatDate(day.date), COL.date, y, { size: 11 });
    drawText(doc, formatWeekday(day.date), COL.day, y, { size: 11, color: MUTED });
    drawText(doc, day.goingStatus === 'in' ? 'IN' : 'OUT', COL.going, y, {
      size: 11,
      bold: true,
      color: day.goingStatus === 'in' ? IN_COLOR : OUT_COLOR,
    });
    drawText(doc, day.returningStatus === 'in' ? 'IN' : 'OUT', COL.returning, y, {
      size: 11,
      bold: true,
      color: day.returningStatus === 'in' ? IN_COLOR : OUT_COLOR,
    });
    y += ROW_HEIGHT;
  });

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    drawText(doc, `Page ${page} of ${pages}`, PAGE.width - PAGE.margin - 58, PAGE.height - 28, {
      size: 9,
      color: MUTED,
    });
  }
  return doc;
}

export function generateAttendancePdf(data: AttendancePdfData): void {
  try {
    const slug = data.employeeName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    buildAttendancePdf(data).save(`in-record-${slug ? `${slug}-` : ''}${todayKey()}.pdf`);
  } catch (err) {
    console.error(err);
    throw makeError('pdf');
  }
}
