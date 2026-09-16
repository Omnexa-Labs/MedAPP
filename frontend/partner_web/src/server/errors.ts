export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function responseError(response: Response): Promise<HttpError> {
  if (response.status >= 500)
    return new HttpError(
      response.status,
      'The service is unavailable. Please try again.',
    );
  let message = 'The request could not be completed.';
  try {
    const body = await response.json();
    if (typeof body.detail === 'string') message = body.detail;
    else if (typeof body.error === 'string') message = body.error;
    else if (Array.isArray(body.detail))
      message = body.detail
        .map((item: { msg?: string }) => item.msg || 'Check the form fields.')
        .join(' ');
  } catch {
    /* The upstream may not return JSON. */
  }
  return new HttpError(response.status, message);
}
