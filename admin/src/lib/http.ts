export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function fail(error: unknown) {
  if (error instanceof HttpError) {
    if (error.status >= 500) console.error(error);
    return json({ error: error.message }, error.status);
  }
  console.error(error);
  return json({ error: 'Something went wrong on the desk.' }, 500);
}
