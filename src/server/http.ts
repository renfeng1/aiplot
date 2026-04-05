import "server-only";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "BAD_REQUEST",
    public details?: unknown,
  ) {
    super(message);
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    status: init?.status ?? 200,
  });
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  console.error(error);

  return Response.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "服务器暂时不可用，请稍后重试。",
      },
    },
    { status: 500 },
  );
}

export function getRequestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
