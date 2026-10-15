import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";

// Only the reviewed site illustration is exempt from the content-image ban.
// Update the digest only after visual approval of replacement artwork.
const approvedAssets: Record<string, string> = {
  "illustrations/family-outing.png":
    "d5f3875b1b82e35a1148db344b87e38579fb2058764aeb3297a1c9bcf6c831f2",
};

// Callers reject symlinks and pass regular files before invoking this check.
export async function isApprovedSiteAsset(
  root: string,
  path: string,
): Promise<boolean> {
  const name = relative(root, path).split(sep).join("/");
  const expected = approvedAssets[name];
  if (!expected) return false;
  return (
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex") === expected
  );
}
