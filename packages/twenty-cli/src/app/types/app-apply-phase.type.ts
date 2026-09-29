export type AppApplyPhase =
  | 'build'
  | 'preview'
  | 'confirmation'
  | 'registration'
  | 'installation'
  | 'upload'
  | 'sync'
  | 'clientGeneration';

export type AppApplyOutcome = 'not-started' | 'partial' | 'unknown' | 'applied';
