export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function responseError(response: Response) {
  if (response.status >= 500)
    return new HttpError(
      503,
      "The pharmacy service is temporarily unavailable. Please try again.",
    );
  if (response.status === 401)
    return new HttpError(401, "Your session has expired. Sign in again.");
  let message = "The request could not be completed.";
  try {
    const body = await response.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail))
      message = body.detail
        .map((item: { msg?: string }) => item.msg || "Check the form fields.")
        .join(" ");
  } catch {
    /* Some upstream failures have no JSON body. */
  }
  return new HttpError(response.status, message);
}
