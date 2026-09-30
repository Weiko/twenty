export type SourceValidationResult = {
  success: boolean;
  config: Record<string, unknown>;
  errors: string[];
  warnings?: string[];
};
