import { stripVTControlCharacters } from 'node:util';

import { dimText } from '@/output/style';

type TableColumn<TRow> = {
  header: string;
  value: (row: TRow) => string;
  align?: 'left' | 'right';
};

const COLUMN_GAP = '   ';
const ROW_INDENT = '  ';

const getVisibleLength = (text: string) =>
  stripVTControlCharacters(text).length;

const pad = ({
  cell,
  width,
  align,
}: {
  cell: string;
  width: number;
  align: 'left' | 'right';
}) => {
  const padding = ' '.repeat(Math.max(0, width - getVisibleLength(cell)));

  return align === 'right' ? `${padding}${cell}` : `${cell}${padding}`;
};

export const formatTable = <TRow>({
  rows,
  columns,
}: {
  rows: TRow[];
  columns: TableColumn<TRow>[];
}) => {
  const cells = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, columnIndex) =>
    Math.max(
      column.header.length,
      ...cells.map((rowCells) => getVisibleLength(rowCells[columnIndex])),
    ),
  );

  const formatRow = (rowCells: string[]) =>
    `${ROW_INDENT}${rowCells
      .map((cell, columnIndex) =>
        pad({
          cell,
          width: widths[columnIndex],
          align: columns[columnIndex].align ?? 'left',
        }),
      )
      .join(COLUMN_GAP)}`.trimEnd();

  return [
    dimText(formatRow(columns.map((column) => column.header))),
    ...cells.map(formatRow),
  ].join('\n');
};
