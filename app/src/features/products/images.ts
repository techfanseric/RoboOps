import type { ProductImage } from "./types";
import { PRODUCT_RULES } from "./domain";

const PREFIX = "roboops.product-image.v1:";
export function productImageSource(image: ProductImage): string {
  try { return localStorage.getItem(PREFIX + image.url.slice("local-image:".length)) || ""; } catch { return ""; }
}
/** Assets are saved once; catalog revisions contain only immutable references. */
export async function uploadProductImage(file: File): Promise<ProductImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("仅支持 JPG、PNG、WebP 图片");
  if (file.size > PRODUCT_RULES.imageMaxBytes) throw new Error("原图不能超过 5 MB");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("图片读取失败，请重新上传")); image.src = source; });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片尺寸无效");
    const scale = Math.min(1, 800 / image.naturalWidth, 600 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器无法处理图片");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let url = canvas.toDataURL("image/jpeg", 0.82);
    for (const quality of [0.65, 0.45, 0.3]) { if (url.length <= 150 * 1024) break; url = canvas.toDataURL("image/jpeg", quality); }
    if (url.length > 150 * 1024) throw new Error("图片压缩后仍过大，请换用更简洁的图片");
    const id = crypto.randomUUID();
    try { localStorage.setItem(PREFIX + id, url); } catch { throw new Error("图片保存失败，浏览器存储空间不足"); }
    return { id, name: file.name, url: `local-image:${id}`, width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(source); }
}
