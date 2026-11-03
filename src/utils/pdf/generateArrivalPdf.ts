import { jsPDF } from 'jspdf';
import { COMPANY_NAME } from '../../config/constants';
import { buildArrivalMonth, isLate, ON_TIME_UNTIL, type ArrivalRecord } from '../arrivals';
import { formatDate, formatMonth, formatTime, formatWeekday, todayKey } from '../date/format';
import { makeError } from '../errors';
import {
  drawLabelled,
  drawPageNumbers,
  drawText,
  HEADER_FILL,
  IN_COLOR,
  MUTED,
  OUT_COLOR,
  PAGE,
  ZEBRA_FILL,
  type Rgb,
} from './pdfKit';

export interface ArrivalPdfData {
  route: string;
  /** yyyy-mm */
  month: string;
  /** The month's going trips (from the arrival history). */
  records: ArrivalRecord[];
  /** Today's day key; only tests pass it. */
  today?: string;
}

/** Column x positions (pt). */
const COL = {
  index: PAGE.margin + 6,
  date: PAGE.margin + 34,
  day: PAGE.margin + 128,
  time: PAGE.margin + 182,
  status: PAGE.margin + 262,
  by: PAGE.margin + 336,
};
const ROW_HEIGHT = 20;
const FOOTER_SPACE = 44;

/** 462 → "7:42 AM" (English, like the rest of the PDF). */
export function formatMinutesEn(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = String(minutes % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

function drawTableHeader(doc: jsPDF, y: number): number {
  doc.setFillColor(...HEADER_FILL);
  doc.rect(PAGE.margin, y - 14, PAGE.width - PAGE.margin * 2, ROW_HEIGHT, 'F');
  const style = { size: 10, bold: true, color: MUTED } as const;
  drawText(doc, '#', COL.index, y, style);
  drawText(doc, 'Date', COL.date, y, style);
  drawText(doc, 'Day', COL.day, y, style);
  drawText(doc, 'Arrival', COL.time, y, style);
  drawText(doc, 'Status', COL.status, y, style);
  drawText(doc, 'Recorded by', COL.by, y, style);
  return y + ROW_HEIGHT;
}

/** The Status column, in Arabic like the app's badges (drawn as an image by drawText). */
export const arrivalStatus = (minutes: number | null): { text: string; color: Rgb } =>
  minutes === null
    ? { text: 'لم يُسجَّل', color: MUTED }
    : isLate(minutes)
      ? { text: 'متأخر', color: OUT_COLOR }
      : { text: 'بدري', color: IN_COLOR };

/** Builds the monthly arrival document (no download) – kept separate so it can be tested. */
export function buildArrivalPdf(data: ArrivalPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const view = buildArrivalMonth(data.records, data.month, data.today ?? todayKey());
  const rows = [...view.rows].reverse(); // calendar order on paper
  let y = PAGE.margin + 10;

  drawText(doc, COMPANY_NAME, PAGE.margin, y, { size: 12, color: MUTED });
  y += 28;
  drawText(doc, 'Bus Arrival Record', PAGE.margin, y, { size: 20, bold: true });
  y += 14;
  doc.setDrawColor(229, 30, 37); // J&T red
  doc.setLineWidth(3);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 28;

  const info: [string, string][] = [
    ['Route:', data.route],
    ['Month:', formatMonth(data.month)],
    ['On time:', `until ${formatMinutesEn(ON_TIME_UNTIL)} (later = late)`],
    ['Generated:', `${formatDate(todayKey())}  ${formatTime(new Date(), 'en-US')}`],
  ];
  for (const [label, value] of info) {
    drawLabelled(doc, label, value, y);
    y += 20;
  }

  // Totals of the month
  y += 10;
  doc.setDrawColor(223, 222, 228);
  doc.setLineWidth(0.6);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 22;
  drawText(doc, `Days recorded: ${view.recorded} of ${rows.length}`, PAGE.margin, y, { size: 12, bold: true });
  drawText(doc, `On time: ${view.onTime}`, PAGE.margin + 230, y, { size: 12, bold: true, color: IN_COLOR });
  drawText(doc, `Late: ${view.late}`, PAGE.margin + 340, y, { size: 12, bold: true, color: OUT_COLOR });
  y += 30;

  y = drawTableHeader(doc, y);
  if (rows.length === 0) drawText(doc, 'No days in this month yet.', PAGE.margin + 6, y, { color: MUTED });

  rows.forEach((row, index) => {
    if (y > PAGE.height - PAGE.margin - FOOTER_SPACE) {
      doc.addPage();
      y = drawTableHeader(doc, PAGE.margin + 10);
    }
    if (index % 2 === 1) {
      doc.setFillColor(...ZEBRA_FILL);
      doc.rect(PAGE.margin, y - 14, PAGE.width - PAGE.margin * 2, ROW_HEIGHT, 'F');
    }
    const s = arrivalStatus(row.minutes);
    drawText(doc, String(index + 1), COL.index, y, { size: 10, color: MUTED });
    drawText(doc, formatDate(row.date), COL.date, y, { size: 11 });
    drawText(doc, formatWeekday(row.date), COL.day, y, { size: 11, color: MUTED });
    drawText(doc, row.minutes === null ? '-' : formatMinutesEn(row.minutes), COL.time, y, { size: 11, bold: true, color: s.color });
    drawText(doc, s.text, COL.status, y, { size: 11, bold: true, color: s.color });
    if (row.arrivedByName) drawText(doc, row.arrivedByName, COL.by, y, { size: 10 });
    y += ROW_HEIGHT;
  });

  drawPageNumbers(doc);
  return doc;
}

export function generateArrivalPdf(data: ArrivalPdfData): void {
  try {
    buildArrivalPdf(data).save(`bus-arrivals-${data.month}.pdf`);
  } catch (err) {
    console.error(err);
    throw makeError('pdf');
  }
}
