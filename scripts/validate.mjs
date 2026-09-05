import { readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(projectRoot, "dist");
const errors = [];

const [html, app, worker, manifestText, hostingText] = await Promise.all([
  readFile(resolve(dist, "index.html"), "utf8"),
  readFile(resolve(dist, "app.js"), "utf8"),
  readFile(resolve(dist, "sw.js"), "utf8"),
  readFile(resolve(dist, "manifest.webmanifest"), "utf8"),
  readFile(resolve(projectRoot, ".openai/hosting.json"), "utf8")
]);

let manifest;
let hosting;
try { manifest = JSON.parse(manifestText); } catch { errors.push("manifest.webmanifest 不是有效 JSON"); }
try { hosting = JSON.parse(hostingText); } catch { errors.push("hosting.json 不是有效 JSON"); }

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) errors.push(`HTML 存在重复 id：${[...new Set(duplicateIds)].join(", ")}`);

const selectors = [...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]);
const missingIds = selectors.filter((id) => !ids.includes(id));
if (missingIds.length) errors.push(`app.js 引用了不存在的 id：${[...new Set(missingIds)].join(", ")}`);

const htmlAssets = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((match) => match[1]);
const manifestAssets = (manifest?.icons || []).map((icon) => icon.src);
const workerAssets = [...worker.matchAll(/"(\.\/[^"#?]+)"/g)].map((match) => match[1]);
const assets = [...new Set([...htmlAssets, ...manifestAssets, ...workerAssets])]
  .filter((item) => item !== "./")
  .map((item) => item.replace(/^\.\//, ""));

for (const asset of assets) {
  try { await access(resolve(dist, asset)); }
  catch { errors.push(`缺少本地资源：${asset}`); }
}

if (hosting?.static?.directory !== "dist") errors.push("hosting.json 的静态目录应为 dist");
try { await access(resolve(projectRoot, hosting?.static?.directory || "", "index.html")); }
catch { errors.push("发布目录中缺少 index.html"); }

if (!manifest?.name || !manifest?.start_url || manifest?.display !== "standalone") {
  errors.push("PWA manifest 缺少必要字段");
}

if (errors.length) {
  console.error(errors.map((error) => `✗ ${error}`).join("\n"));
  process.exit(1);
}

console.log(`✓ 静态资源完整（${assets.length} 个引用）`);
console.log(`✓ HTML id 唯一（${ids.length} 个）`);
console.log(`✓ JavaScript 界面引用有效（${selectors.length} 个）`);
console.log("✓ PWA 与发布配置有效");
