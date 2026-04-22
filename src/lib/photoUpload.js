import { supabase } from "./supabase";

const BUCKET = "avatars";
const MAX_EDGE = 512;
const JPEG_QUALITY = 0.8;

// Downscale to fit within MAX_EDGE × MAX_EDGE while preserving aspect
// ratio, and export as JPEG. Never upscales — a 300×400 source stays
// 300×400. Input can be any browser-decodable image (JPEG/PNG/WebP on
// all browsers, HEIC on mobile Safari). EXIF orientation is honored so
// portrait phone photos aren't rotated sideways.
async function resizeToJpegBlob(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Could not read image");
  }

  const { width: w, height: h } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("Could not encode image");
  return blob;
}

// Upload a profile photo for a student or coach. Returns the public URL.
// kind: "students" | "coaches"
export async function uploadProfilePhoto(file, { kind, id }) {
  if (!file) throw new Error("No file provided");
  if (kind !== "students" && kind !== "coaches") {
    throw new Error(`Invalid kind: ${kind}`);
  }
  if (!id) throw new Error("No id provided");

  const blob = await resizeToJpegBlob(file);
  const path = `${kind}/${id}/${Date.now()}.jpg`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
