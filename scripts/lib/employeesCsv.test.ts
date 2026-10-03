import { describe, expect, it } from 'vitest';
import { parseCsv, parseEmployees } from './employeesCsv';

const norm = (s: string) => s.trim().toUpperCase();
const ID = /^[A-Z0-9_-]{3,32}$/;

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and ; delimiters', () => {
    expect(parseCsv('\uFEFFa;b;c\r\n1;"x;y";"he said ""hi"""\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x;y', 'he said "hi"'],
    ]);
  });
});

describe('parseEmployees', () => {
  it('reads valid rows, normalising the ID', () => {
    const { rows, errors } = parseEmployees(
      'employeeId,name,type\nemp1001, Ahmed  Ali ,MAIN\nEMP1002,Sara,waiting\n',
      norm,
      ID,
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.employeeId, r.name, r.type, r.busId])).toEqual([
      ['EMP1001', 'Ahmed Ali', 'main', null],
      ['EMP1002', 'Sara', 'waiting', null],
    ]);
  });

  it('collects every problem at once', () => {
    const { errors } = parseEmployees(
      'employeeId,name,type\nx,Name,main\nEMP1,,main\nEMP2,Bob,boss\nEMP2,Bob,main\n',
      norm,
      ID,
    );
    expect(errors).toHaveLength(4);
  });

  it('requires the header columns', () => {
    expect(parseEmployees('id,name\n1,2\n', norm, ID).errors).toHaveLength(1);
  });
});
