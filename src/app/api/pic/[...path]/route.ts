import { NextResponse } from "next/server";

const PIC_ORIGIN = "http://43.166.250.145/pic";

function fallbackContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path = [] } = await context.params;
  const safePath = path.filter(Boolean);

  if (!safePath.length || safePath.some((segment) => segment === "." || segment === ".." || segment.includes("\\"))) {
    return new NextResponse("Invalid image path", { status: 400 });
  }

  const targetUrl = `${PIC_ORIGIN}/${safePath.map(encodeURIComponent).join("/")}`;
  const upstream = await fetch(targetUrl, {
    cache: "force-cache",
    next: { revalidate: 3600 },
  });

  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Image not found", { status: upstream.status || 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || fallbackContentType(safePath[safePath.length - 1]));
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
