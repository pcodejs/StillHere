// Validate the user-supplied product artwork without regenerating it.
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
for (const size of [16, 32, 48, 128, 512]) {
  const png = PNG.sync.read(await readFile(`src/icons/${size}.png`));
  if (png.width !== size || png.height !== size) {
    throw new Error(`Product icon ${size}.png has an incorrect size`);
  }
}
console.log("Validated the approved StillHere product icons at 16/32/48/128/512px");
