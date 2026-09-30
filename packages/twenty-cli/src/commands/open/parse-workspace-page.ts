import { isDefined } from 'twenty-shared/utils';

import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

const PLACEHOLDER_ORIGIN = 'http://workspace.invalid';

export const parseWorkspacePage = (page: string) => {
  const pageUrl = URL.parse(page, `${PLACEHOLDER_ORIGIN}/`);

  if (!isDefined(pageUrl) || pageUrl.origin !== PLACEHOLDER_ORIGIN) {
    throw new CliError({
      code: 'USAGE',
      exitCode: EXIT_CODE.USAGE,
      message: `${page} is not a page of the workspace.`,
      hint: 'Pass a path inside the workspace, for example settings/applications.',
    });
  }

  return `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`;
};
