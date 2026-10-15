import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, link, unlink } from "node:fs/promises";
import { join } from "node:path";

export function validId(id: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw new Error("Invalid local id");
}
export function validDate(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid date");
}
export async function directory(
  path: string,
  create = false,
  optional = false,
) {
  if (create) {
    try {
      await mkdir(path, { mode: 0o700 });
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ))
        throw error;
    }
  }
  try {
    if (!(await lstat(path)).isDirectory())
      throw new Error(`${path}: 目錄不得是符號連結`);
    return true;
  } catch (error) {
    if (
      optional &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return false;
    throw error;
  }
}
export async function researchDirectory(root: string, id?: string) {
  const base = join(root, "research");
  await directory(base, true);
  if (!id) return base;
  validId(id);
  const path = join(base, id);
  await directory(path);
  return path;
}
export async function readLocal(
  path: string,
  optional = false,
): Promise<string | undefined> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!(await file.stat()).isFile())
        throw new Error(`${path}: 必須是一般檔案`);
      return await file.readFile("utf8");
    } finally {
      await file.close();
    }
  } catch (error) {
    if (
      optional &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return undefined;
    throw error;
  }
}
export async function writeLocal(
  path: string,
  text: string | Uint8Array,
  exclusive = false,
) {
  // Finish and sync a sibling file before replacing the sole local evidence.
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      await file.writeFile(text);
      await file.sync();
    } finally {
      await file.close();
    }
    if (exclusive) {
      await link(temporary, path);
    } else {
      try {
        if (!(await lstat(path)).isFile())
          throw new Error(`${path}: 必須是一般檔案`);
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw error;
      }
      await rename(temporary, path);
    }
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    });
  }
}
