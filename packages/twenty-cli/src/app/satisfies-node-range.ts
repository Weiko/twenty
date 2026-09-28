import { isDefined } from 'twenty-shared/utils';

type Version = [number, number, number];

const VERSION_PATTERN = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;
const COMPARATOR_PATTERN = /^(\^|~|>=|<=|>|<|=)?(.+)$/;

const parsePartialVersion = (text: string) => {
  const match = VERSION_PATTERN.exec(text);

  if (!isDefined(match)) {
    return undefined;
  }

  const parts = match.slice(1).filter(isDefined).map(Number);

  return {
    version: [parts[0], parts[1] ?? 0, parts[2] ?? 0] as Version,
    precision: parts.length,
  };
};

const compareVersions = (first: Version, second: Version) =>
  first[0] - second[0] || first[1] - second[1] || first[2] - second[2];

const getCaretUpperBound = ([major, minor, patch]: Version): Version => {
  if (major > 0) {
    return [major + 1, 0, 0];
  }

  if (minor > 0) {
    return [0, minor + 1, 0];
  }

  return [0, 0, patch + 1];
};

const satisfiesComparator = (version: Version, comparator: string) => {
  const match = COMPARATOR_PATTERN.exec(comparator);
  const bound = isDefined(match) ? parsePartialVersion(match[2]) : undefined;

  if (!isDefined(match) || !isDefined(bound)) {
    return undefined;
  }

  const comparison = compareVersions(version, bound.version);

  switch (match[1]) {
    case '^':
      return (
        comparison >= 0 &&
        compareVersions(version, getCaretUpperBound(bound.version)) < 0
      );
    case '~':
      return (
        comparison >= 0 &&
        compareVersions(
          version,
          bound.precision === 1
            ? [bound.version[0] + 1, 0, 0]
            : [bound.version[0], bound.version[1] + 1, 0],
        ) < 0
      );
    case '>=':
      return comparison >= 0;
    case '>':
      return comparison > 0;
    case '<=':
      return comparison <= 0;
    case '<':
      return comparison < 0;
    default:
      return comparison === 0;
  }
};

export const satisfiesNodeRange = ({
  version,
  range,
}: {
  version: string;
  range: string;
}): boolean | undefined => {
  const current = parsePartialVersion(version);
  const alternatives = range
    .split('||')
    .map((alternative) => alternative.trim().split(/\s+/).filter(Boolean));

  if (
    !isDefined(current) ||
    alternatives.some((comparators) => comparators.length === 0)
  ) {
    return undefined;
  }

  const results = alternatives.map((comparators) =>
    comparators.map((comparator) =>
      satisfiesComparator(current.version, comparator),
    ),
  );

  if (
    results.some((comparators) =>
      comparators.some((result) => !isDefined(result)),
    )
  ) {
    return undefined;
  }

  return results.some((comparators) => comparators.every(Boolean));
};
