import { jsPDF } from 'jspdf';
import { COMPANY_NAME } from '../../config/constants';
import type { AttendanceDay, EmployeeType } from '../../types';
import { buildMonth, type MonthRow } from '../attendance';
import { formatDate, formatMonth, formatTime, formatWeekday, serviceDayKey, todayKey } from '../date/format';
import { makeError } from '../errors';
import { drawLabelled, drawPageNumbers, drawText, HEADER_FILL, IN_COLOR, MUTED, OUT_COLOR, PAGE, ZEBRA_FILL, type Rgb } from './pdfKit';

export interface AttendancePdfData {
  /** The Employee ID is the sign-in credential, so it is deliberately not part of the data (nor of the PDF). */
  employeeName: string;
  employeeType: EmployeeType;
  route: string;
  /** The month of the record, yyyy-mm. */
  month: string;
  /** The employee's recorded days (any months – only `month` is printed). */
  days: AttendanceDay[];
  /** Today's day key; only tests pass it. */
  today?: string;
}

/** Column x positions (pt). */
const COL = {
  index: PAGE.margin + 6,
  date: PAGE.margin + 46,
  day: PAGE.margin + 170,
  going: PAGE.margin + 260,
  returning: PAGE.margin + 390,
};
const ROW_HEIGHT = 20;
const FOOTER_SPACE = 44;

function drawTableHeader(doc: jsPDF, y: number): number {
  doc.setFillColor(...HEADER_FILL);
  doc.rect(PAGE.margin, y - 14, PAGE.width - PAGE.margin * 2, ROW_HEIGHT, 'F');
  const style = { size: 10, bold: true, color: MUTED } as const;
  drawText(doc, 'Day #', COL.index, y, style);
  drawText(doc, 'Date', COL.date, y, style);
  drawText(doc, 'Day', COL.day, y, style);
  drawText(doc, 'Going', COL.going, y, style);
  drawText(doc, 'Returning', COL.returning, y, style);
  return y + ROW_HEIGHT;
}

const cell = (status: MonthRow['goingStatus']): { text: string; color: Rgb } =>
  status === 'in'
    ? { text: 'IN', color: IN_COLOR }
    : status === 'out'
      ? { text: 'OUT', color: OUT_COLOR }
      : { text: '-', color: MUTED };

/** Builds the monthly document (no download) – kept separate so it can be tested / previewed. */
export function buildAttendancePdf(data: AttendancePdfData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const view = buildMonth(data.days, data.month, data.today ?? serviceDayKey());
  let y = PAGE.margin + 10;

  drawText(doc, COMPANY_NAME, PAGE.margin, y, { size: 12, color: MUTED });
  y += 28;
  drawText(doc, 'Employee Monthly IN Record', PAGE.margin, y, { size: 20, bold: true });
  y += 14;
  doc.setDrawColor(229, 30, 37); // J&T red
  doc.setLineWidth(3);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 28;

  const info: [string, string][] = [
    ['Employee:', data.employeeName],
    ['Type:', data.employeeType === 'main' ? 'Main' : 'Waiting'],
    ['Route:', data.route],
    ['Month:', formatMonth(data.month)],
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
  drawText(doc, `Days recorded: ${view.recorded} of ${view.rows.length}`, PAGE.margin, y, { size: 12, bold: true });
  y += 22;
  drawText(doc, `Going - IN: ${view.goingIn} days`, PAGE.margin, y, { size: 12, bold: true, color: IN_COLOR });
  drawText(doc, `Returning - IN: ${view.returningIn} days`, PAGE.margin + 230, y, {
    size: 12,
    bold: true,
    color: IN_COLOR,
  });
  y += 30;

  y = drawTableHeader(doc, y);
  if (view.rows.length === 0) drawText(doc, 'No days in this month yet.', PAGE.margin + 6, y, { color: MUTED });

  view.rows.forEach((row, index) => {
    if (y > PAGE.height - PAGE.margin - FOOTER_SPACE) {
      doc.addPage();
      y = drawTableHeader(doc, PAGE.margin + 10);
    }
    if (index % 2 === 1) {
      doc.setFillColor(...ZEBRA_FILL);
      doc.rect(PAGE.margin, y - 14, PAGE.width - PAGE.margin * 2, ROW_HEIGHT, 'F');
    }
    const going = cell(row.goingStatus);
    const returning = cell(row.returningStatus);
    drawText(doc, String(index + 1), COL.index, y, { size: 10, color: MUTED });
    drawText(doc, formatDate(row.date), COL.date, y, { size: 11 });
    drawText(doc, formatWeekday(row.date), COL.day, y, { size: 11, color: MUTED });
    drawText(doc, going.text, COL.going, y, { size: 11, bold: true, color: going.color });
    drawText(doc, returning.text, COL.returning, y, { size: 11, bold: true, color: returning.color });
    y += ROW_HEIGHT;
  });

  drawPageNumbers(doc);
  return doc;
}

export function generateAttendancePdf(data: AttendancePdfData): void {
  try {
    const slug = data.employeeName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    buildAttendancePdf(data).save(`in-record-${slug ? `${slug}-` : ''}${data.month}.pdf`);
  } catch (err) {
    console.error(err);
    throw makeError('pdf');
  }
}
