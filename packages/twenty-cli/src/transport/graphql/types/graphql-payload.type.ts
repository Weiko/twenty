export type GraphqlErrorEntry = {
  message?: string;
  path?: (string | number)[];
  extensions?: { code?: string };
};

export type GraphqlPayload = {
  data?: Record<string, unknown> | null;
  errors?: GraphqlErrorEntry[];
};
