/**
 * 图片上传 API
 * 1. 接受 multipart/form-data 文件上传
 * 2. 转 base64 后发到腾讯云 ASP 上传端点
 * 3. 返回文件名（如 1777566392625.png）
 */
import { NextResponse } from "next/server";

const UPLOAD_URL = "http://43.166.250.145:8082/index.asp";
const PIC_PROXY_BASE = "/api/pic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    if (!["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      return NextResponse.json({ ok: false, error: `Unsupported file type: .${ext}` }, { status: 400 });
    }

    // Read file as ArrayBuffer → base64
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Upload to Tencent Cloud ASP endpoint
    const body = `${ext},${base64}`;
    const uploadRes = await fetch(`${UPLOAD_URL}?r=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!uploadRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Upload server returned ${uploadRes.status}` },
        { status: 502 },
      );
    }

    const responseText = await uploadRes.text();
    // Response format: "{date},{timestamp},{ext}"
    const parts = responseText.split(",");
    const timestamp = parts[1] || String(Date.now());
    const filename = `${timestamp}.${ext}`;

    return NextResponse.json({
      ok: true,
      filename,
      url: `${PIC_PROXY_BASE}/${encodeURIComponent(filename)}`,
    });
  } catch (err: any) {
    console.error("[upload] Error:", err.message || err);
    return NextResponse.json(
      { ok: false, error: err.message || "Upload failed" },
      { status: 500 },
    );
  }
}


