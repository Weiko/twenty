import { type DataPage } from '@/data/types/data-page.type';
import { CliError } from '@/output/cli-error';

export async function* iterateDataPages({
  fetchPage,
  cursor,
  signal,
}: {
  fetchPage: (cursor?: string) => Promise<DataPage>;
  cursor?: string;
  signal: AbortSignal;
}) {
  let checkpoint = cursor;
  let checkpointInterval = 1;
  let pagesSinceCheckpoint = 0;

  while (true) {
    signal.throwIfAborted();
    const page = await fetchPage(cursor);
    signal.throwIfAborted();
    const nextCursor = page.pageInfo.endCursor;

    if (
      page.records.length > 0 &&
      (nextCursor === cursor || nextCursor === checkpoint)
    ) {
      throw new CliError({
        code: 'INVALID_RESPONSE',
        message: 'The server returned a repeated pagination cursor.',
      });
    }

    if (page.pageInfo.hasNextPage) {
      // Detect cursor cycles without retaining an unbounded export history.
      pagesSinceCheckpoint += 1;

      if (pagesSinceCheckpoint === checkpointInterval) {
        checkpoint = nextCursor ?? undefined;
        checkpointInterval *= 2;
        pagesSinceCheckpoint = 0;
      }
    }

    yield page;

    if (!page.pageInfo.hasNextPage) {
      return;
    }

    cursor = nextCursor ?? undefined;
  }
}
