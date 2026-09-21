export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'error',
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
export const badRequest = (m: string, details?: unknown) => new AppError(400, m, 'bad_request', details);
export const unauthorized = (m = 'Please sign in') => new AppError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have permission for this action') => new AppError(403, m, 'forbidden');
export const notFound = (m = 'Not found') => new AppError(404, m, 'not_found');
export const conflict = (m: string, details?: unknown) => new AppError(409, m, 'conflict', details);
/** Business rule violations that the UI should show as a blocking message. */
export const blocked = (m: string, details?: unknown) => new AppError(422, m, 'blocked', details);
