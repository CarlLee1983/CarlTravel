import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function checkPublicAssets(root: string): Promise<void> {
  try {
    const stat = await lstat(root);
    if (!stat.isDirectory())
      throw new Error(`${root}: 公開資產目錄不得是檔案或符號連結`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;
    throw error;
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`${path}: 公開資產不得使用符號連結`);
    if (["drafts", "research"].includes(entry.name.toLowerCase()))
      throw new Error(`${path}: 私人目錄不得放入公開資產`);
    if (
      /\.(?:avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp)$/i.test(entry.name)
    )
      throw new Error(`${path}: 公開資產不得包含景點圖片`);
    if (entry.isDirectory()) await checkPublicAssets(path);
  }
}
