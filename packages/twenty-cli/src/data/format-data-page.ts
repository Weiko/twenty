import { isDefined } from 'twenty-shared/utils';

import { assertDataResultLimit } from '@/data/assert-data-result-limit';
import { formatDataCell } from '@/data/format-data-value';
import { type readDataListOptions } from '@/data/read-data-list-options';
import { type DataPage, type DataRecord } from '@/data/types/data-page.type';
import { formatTable } from '@/output/format-table';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';

const shellQuote = (value: string) =>
  /^[a-zA-Z0-9_./:@=-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

const getDataCell = (record: DataRecord, field: string) =>
  formatDataCell(Object.hasOwn(record, field) ? record[field] : undefined);

export const formatDataPage = ({
  page,
  objectName,
  options,
  target,
}: {
  page: DataPage;
  objectName: string;
  options: ReturnType<typeof readDataListOptions>;
  target: ResolvedTarget;
}) => {
  const availableFields = Object.keys(page.records[0] ?? {});
  const fields =
    options.fields ??
    [
      ...['id', 'name'].filter((field) => availableFields.includes(field)),
      ...availableFields.filter((field) => field !== 'id' && field !== 'name'),
    ].slice(0, 5);

  let extraBytes = 0;
  const rowWidth = fields.reduce((width, field) => {
    const header = formatDataCell(field);
    let columnWidth = header.length;

    extraBytes += Buffer.byteLength(header, 'utf8') - header.length;

    for (const record of page.records) {
      const cell = getDataCell(record, field);

      columnWidth = Math.max(columnWidth, cell.length);
      extraBytes += Buffer.byteLength(cell, 'utf8') - cell.length;
    }

    return width + columnWidth + 3;
  }, 2);

  assertDataResultLimit({
    recordCount: page.records.length,
    bytes: rowWidth * (page.records.length + 1) + extraBytes,
  });
  const table =
    page.records.length === 0
      ? 'No records.'
      : formatTable({
          rows: page.records,
          columns: fields.map((field) => ({
            header: formatDataCell(field),
            value: (record: DataRecord) => getDataCell(record, field),
          })),
        });
  const footer = `${page.records.length} of ${page.totalCount} records`;

  if (!page.pageInfo.hasNextPage) {
    return `${table}\n${footer}`;
  }

  const nextArguments = [
    'twenty',
    'data',
    'list',
    objectName,
    '--limit',
    String(options.limit),
  ];

  for (const [flag, value] of [
    ['--remote', target.remoteName],
    ['--filter', options.filter],
    ['--order-by', options.orderBy],
    ['--fields', options.fields?.join(',')],
    ['--cursor', page.pageInfo.endCursor],
  ] as const) {
    if (isDefined(value)) {
      nextArguments.push(flag, value);
    }
  }

  return `${table}\n${footer} · next page: ${nextArguments.map(shellQuote).join(' ')}`;
};
