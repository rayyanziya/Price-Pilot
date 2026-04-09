const backendOrigin = process.env.PRICEPILOT_API_ORIGIN ?? "http://127.0.0.1:4000";
const backendQuoteUrl = new URL("/api/v1/price/quote", backendOrigin);

export async function POST(request) {
  try {
    const response = await fetch(backendQuoteUrl, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        "x-request-id": request.headers.get("x-request-id") ?? crypto.randomUUID(),
      },
      body: await request.text(),
      cache: "no-store",
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Price quote proxy failed", error);

    return Response.json(
      {
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Quote service is unavailable. Check that the local backend is running and try again.",
        },
      },
      { status: 503 },
    );
  }
}
