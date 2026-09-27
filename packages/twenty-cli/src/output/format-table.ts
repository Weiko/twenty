import { dimText } from '@/output/style';

type TableColumn<TRow> = {
  header: string;
  value: (row: TRow) => string;
  align?: 'left' | 'right';
};

const COLUMN_GAP = '   ';
const ROW_INDENT = '  ';

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
      ...cells.map((rowCells) => rowCells[columnIndex].length),
    ),
  );

  const formatRow = (rowCells: string[]) =>
    `${ROW_INDENT}${rowCells
      .map((cell, columnIndex) =>
        columns[columnIndex].align === 'right'
          ? cell.padStart(widths[columnIndex])
          : cell.padEnd(widths[columnIndex]),
      )
      .join(COLUMN_GAP)}`.trimEnd();

  return [
    dimText(formatRow(columns.map((column) => column.header))),
    ...cells.map(formatRow),
  ].join('\n');
};
