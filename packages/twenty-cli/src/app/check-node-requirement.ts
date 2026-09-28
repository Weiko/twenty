import satisfies from 'semver/functions/satisfies';
import validRange from 'semver/ranges/valid';

export type NodeRequirementCheck = 'satisfied' | 'unsatisfied' | 'invalid';

export const checkNodeRequirement = ({
  version,
  range,
}: {
  version: string;
  range: string;
}): NodeRequirementCheck => {
  if (validRange(range) === null) {
    return 'invalid';
  }

  return satisfies(version, range) ? 'satisfied' : 'unsatisfied';
};
