export type AppApplyPhase =
  | 'build'
  | 'preview'
  | 'confirmation'
  | 'registration'
  | 'installation'
  | 'upload'
  | 'sync';

export type AppApplyOutcome = 'not-started' | 'partial' | 'unknown';
