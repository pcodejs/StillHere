import './changelog.mjs';
import { build } from "esbuild";
import { mkdir, cp, readFile, rm, rename, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
async function inputFiles(path) {
 const rows = await readdir(path, {withFileTypes:true});
 return (await Promise.all(rows.map(e => e.isDirectory() ? inputFiles(path+"/"+e.name) : [path+"/"+e.name]))).flat();
}
const dir = "outputs/go-lai-extension";
const staging = await mkdtemp(join(tmpdir(), "go-lai-build-"));
try {
  await cp("src/manifest.json", staging + "/manifest.json");
  await cp("src/icons", staging + "/icons", { recursive: true });
  for (const file of [
    "popup.html",
    "privacy.html",
    "privacy-en.html",
    "privacy.css",
    "privacy-nav.js",
    "changelog.html",
    "changelog-en.html",
  ])
    await cp("src/popup/" + file, staging + "/" + file);
  await cp("src/THIRD-PARTY-NOTICES.txt", staging + "/THIRD-PARTY-NOTICES.txt");
  await cp("src/assets", staging + "/assets", { recursive: true });
  await build({
    entryPoints: [
      "src/background.js",
      "src/content.js",
      "src/messenger-content.js",
      "src/page-observer.js",
      "src/popup/popup.js",
    ],
    bundle: true,
    loader: { ".js": "jsx", ".woff2": "file", ".woff": "file" },
    assetNames: "assets/[name]-[hash]",
    define: {
      __STILLHERE_BUILD_VERSION__: JSON.stringify(JSON.parse(await readFile("src/manifest.json", "utf8")).version),
      "process.env.NODE_ENV": '"production"',
    },
    outdir: staging,
    outbase: "src",
    entryNames: "[name]",
    minify: false,
    legalComments: "inline",
    target: "chrome120",
    format: "iife",
  });
  const inputs = {};
  for (const file of [...await inputFiles("src"), ...await inputFiles("scripts"), "package.json", "package-lock.json"].filter(f=>!f.includes("__pycache__")).sort())
    inputs[file] = createHash("sha256").update(await readFile(file)).digest("hex");
  await writeFile(staging+"/build-inputs.json", JSON.stringify(inputs,null,2));
  // Keep the installed extension intact until every input has loaded and compilation succeeds.
  const next = dir + ".next",
    previous = dir + ".previous";
  await mkdir("outputs", { recursive: true });
  await rm(next, { recursive: true, force: true });
  await cp(staging, next, { recursive: true });
  await rm(previous, { recursive: true, force: true });
  try {
    await rename(dir, previous);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  try {
    await rename(next, dir);
  } catch (e) {
    await rename(previous, dir).catch(() => {});
    throw e;
  }
  await rm(previous, { recursive: true, force: true });
} finally {
  await rm(staging, { recursive: true, force: true });
}
const manifest = JSON.parse(await readFile(dir + "/manifest.json", "utf8"));
console.log("Built " + manifest.name + " v" + manifest.version + " → " + dir);

