import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseFormData } from "@/lib/api/validate";
import { isR2Enabled, uploadFile } from "@/lib/r2";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

/**
 * Store the multipart "file" image under `folder` (R2 when configured, else
 * the local uploads directory) and respond with its `{ url }`. Callers own
 * auth and rate limiting.
 */
export async function storeScreenshotUpload(
  request: Request,
  uploaderId: string,
  folder: string
): Promise<Response> {
  const parsed = await parseFormData(request);
  if (!parsed.success) {
    return errorResponse(parsed.status, parsed.error);
  }
  const formData = parsed.data;

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return errorResponse(400, "No file uploaded");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return errorResponse(400, "Only PNG, JPEG, and WebP images are allowed.");
  }
  if (file.size > MAX_SIZE) {
    return errorResponse(400, "Screenshot must be under 8 MB.");
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const timestamp = Date.now();
  const userId = uploaderId.slice(-8);

  try {
    let url: string;

    if (isR2Enabled()) {
      url = await uploadFile(
        `${folder}/${timestamp}-${userId}.${ext}`,
        Buffer.from(await file.arrayBuffer())
      );
    } else {
      const fs = await import("fs/promises");
      const path = await import("path");

      const dir = path.join(process.cwd(), "uploads", folder);
      await fs.mkdir(dir, { recursive: true });

      const filename = `${timestamp}-${userId}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(path.join(dir, filename), buffer);

      url = `/api/uploads/${folder}/${filename}`;
    }

    return NextResponse.json({ url });
  } catch (err) {
    return handleRouteError(err);
  }
}
