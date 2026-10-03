import { createInterface } from 'node:readline';
import { pinProblem } from '../../api/_lib/pin.js';

/** Reads one line from the terminal WITHOUT echoing it (so a PIN never lands on screen or in shell history). */
export function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error('A PIN can only be typed in an interactive terminal.'));
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const muted = rl as unknown as { _writeToOutput: (text: string) => void };
    process.stdout.write(question);
    muted._writeToOutput = () => undefined;
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

/** Asks twice and returns a PIN that passes the strength rules. Throws when the two entries differ. */
export async function promptNewPin(id: string): Promise<string> {
  const pin = await promptHidden(`New PIN for ${id} (min 6 characters): `);
  const problem = pinProblem(pin, id);
  if (problem) throw new Error(problem);
  const again = await promptHidden('Repeat the PIN: ');
  if (again !== pin) throw new Error('The two PINs do not match – nothing was changed.');
  return pin;
}
