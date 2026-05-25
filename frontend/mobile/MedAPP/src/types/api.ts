// API envelope types. `ApiError` is the thrown shape from `lib/api/client.ts` —
// anywhere code catches a thrown error from a query/mutation, narrow with
// `error instanceof ApiError`.

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}
