/**
 * Output helpers that make a GitHub Actions run readable WITHOUT opening the log: errors become annotations (shown
 * on the run page and in the failure e-mail) and a short report goes to the run summary. Outside Actions they are
 * plain console output.
 */
import { appendFileSync } from 'node:fs';

const inActions = process.env.GITHUB_ACTIONS === 'true';

/** Annotation text must stay on one line. */
const escape = (text: string) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export function annotateError(title: string, message: string): void {
  if (inActions) console.log(`::error title=${escape(title)}::${escape(message)}`);
  else console.error(`${title}: ${message}`);
}

export function annotateNotice(title: string, message: string): void {
  if (inActions) console.log(`::notice title=${escape(title)}::${escape(message)}`);
  else console.log(`${title}: ${message}`);
}

/** Appends Markdown to the run summary page (no-op outside Actions). */
export function summary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (inActions && file) appendFileSync(file, `${markdown}\n`);
}
