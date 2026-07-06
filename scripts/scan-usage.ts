import { promises as fs } from "fs";
import * as path from "path";

export interface UsageRecord {
  /** 绝对路径 */
  file: string;
  framework: "svelte" | "react" | "ts" | "unknown";
  usageKind: "named-import" | "namespace-import" | "icon-component" | "namespace-access";
  /** 用户代码中实际写的名字（如 "DotCircle" 或 "arrow-line-right"） */
  symbol: string;
  /** import 源（如 @snowui-design-system/resource-svelte） */
  importSource?: string;
  /** 若 usageKind = namespace-access，记录前缀（如 "Resource"） */
  namespacePrefix?: string;
  /** 若 usageKind = icon-component，记录 collection 显式属性 */
  explicitCollection?: string;
}

export interface ScanOptions {
  /** 扫描根目录列表（绝对或相对当前 cwd） */
  roots: string[];
  /** 限定 import 来源（默认匹配 resource-svelte / resource-react） */
  packageNames?: string[];
  /** 忽略目录（默认含 node_modules / dist / .svelte-kit / .next） */
  ignoreDirs?: string[];
}

const DEFAULT_IGNORES = new Set([
  "node_modules",
  "dist",
  ".svelte-kit",
  ".next",
  "build",
  ".turbo",
  ".cache",
  "coverage",
]);

const DEFAULT_PACKAGES = [
  "@snowui-design-system/resource-svelte",
  "@snowui-design-system/resource-react",
  "@snowui-design-system/resource-base",
];

const SOURCE_EXTS = new Set([".svelte", ".tsx", ".jsx", ".ts", ".js"]);

async function walk(dir: string, ignores: Set<string>, out: string[]): Promise<void> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (ignores.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, ignores, out);
    } else if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name))) {
      out.push(full);
    }
  }
}

function detectFramework(file: string): UsageRecord["framework"] {
  const ext = path.extname(file);
  if (ext === ".svelte") return "svelte";
  if (ext === ".tsx" || ext === ".jsx") return "react";
  if (ext === ".ts" || ext === ".js") return "ts";
  return "unknown";
}

/**
 * 一次扫描：解析 import + 找 <Icon name="..."> 用法 + 找命名空间访问。
 */
export async function scanUsages(options: ScanOptions): Promise<UsageRecord[]> {
  const packages = options.packageNames ?? DEFAULT_PACKAGES;
  const ignores = new Set([...DEFAULT_IGNORES, ...(options.ignoreDirs ?? [])]);

  const files: string[] = [];
  for (const root of options.roots) {
    await walk(path.resolve(root), ignores, files);
  }

  const records: UsageRecord[] = [];
  const pkgPattern = packages
    .map((p) => p.replace(/[/\-@.]/g, (m) => `\\${m}`))
    .join("|");

  // import { A, B as C } from "<pkg>"
  const namedImportRe = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*['"](${pkgPattern})['"]`,
    "g",
  );
  // import * as Resource from "<pkg>"
  const nsImportRe = new RegExp(
    `import\\s*\\*\\s*as\\s+(\\w+)\\s*from\\s*['"](${pkgPattern})['"]`,
    "g",
  );
  // 子路径 import: import { X } from "<pkg>/icons/<col>"
  const subPathImportRe = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*['"](${pkgPattern})\\/[^'\"]+['"]`,
    "g",
  );
  // <Icon name="..." collection?="..." />
  const iconTagRe =
    /<Icon\b([^>]*?)\bname=(?:"([^"]+)"|'([^']+)'|\{[^}]*\})/g;
  // namespace access：仅识别确认过来自我们包的 namespace 前缀（如 import * as Resource 或 import { snowui }）

  for (const file of files) {
    let text: string;
    try {
      text = await fs.readFile(file, "utf-8");
    } catch {
      continue;
    }
    const fw = detectFramework(file);

    const localNamespaces = new Set<string>();
    const COLLECTION_NS = new Set(["snowui", "phosphor", "special"]);
    let m: RegExpExecArray | null;

    // named imports
    namedImportRe.lastIndex = 0;
    while ((m = namedImportRe.exec(text)) !== null) {
      const list = m[1].split(",");
      for (const item of list) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        const [orig, asName] = trimmed.split(/\s+as\s+/);
        const symbol = (asName ?? orig).trim();
        // 如果是 collection namespace（如 import { snowui } from "@.../resource-svelte"），
        // 把它登记到 localNamespaces，方便下面 namespace-access 阶段处理
        if (COLLECTION_NS.has(symbol)) {
          localNamespaces.add(asName ? asName.trim() : symbol);
        }
        records.push({
          file,
          framework: fw,
          usageKind: "named-import",
          symbol,
          importSource: m[2],
        });
      }
    }

    // sub-path imports（按 collection 子路径）
    subPathImportRe.lastIndex = 0;
    while ((m = subPathImportRe.exec(text)) !== null) {
      const list = m[1].split(",");
      for (const item of list) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        const [orig, asName] = trimmed.split(/\s+as\s+/);
        const symbol = (asName ?? orig).trim();
        records.push({
          file,
          framework: fw,
          usageKind: "named-import",
          symbol,
          importSource: m[2],
        });
      }
    }

    // namespace imports
    nsImportRe.lastIndex = 0;
    while ((m = nsImportRe.exec(text)) !== null) {
      const prefix = m[1];
      localNamespaces.add(prefix);
      records.push({
        file,
        framework: fw,
        usageKind: "namespace-import",
        symbol: prefix,
        importSource: m[2],
      });
    }

    // <Icon name="..." />
    iconTagRe.lastIndex = 0;
    while ((m = iconTagRe.exec(text)) !== null) {
      const attrs = m[1] ?? "";
      const name = m[2] ?? m[3];
      if (!name) continue;
      const collectionMatch = attrs.match(/\bcollection=(?:"([^"]+)"|'([^']+)')/);
      records.push({
        file,
        framework: fw,
        usageKind: "icon-component",
        symbol: name,
        explicitCollection: collectionMatch ? collectionMatch[1] || collectionMatch[2] : undefined,
      });
    }

    // namespace access：只使用本文件内确认过的 namespace 前缀（避免误匹配 `css.foo` 等）
    const candidatePrefixes = [...localNamespaces];
    for (const prefix of candidatePrefixes) {
      const re = new RegExp(`\\b${prefix}\\.(\\w+)`, "g");
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(text)) !== null) {
        records.push({
          file,
          framework: fw,
          usageKind: "namespace-access",
          symbol: mm[1],
          namespacePrefix: prefix,
        });
      }
    }
  }

  return records;
}

if (require.main === module) {
  (async () => {
    const roots = process.argv.slice(2);
    if (roots.length === 0) {
      console.error("usage: scan-usage <root> [<root> ...]");
      process.exit(1);
    }
    const records = await scanUsages({ roots });
    const byFile = new Map<string, number>();
    for (const r of records) byFile.set(r.file, (byFile.get(r.file) ?? 0) + 1);
    console.log(`Total usages: ${records.length} across ${byFile.size} files`);
    const byKind = new Map<string, number>();
    for (const r of records) byKind.set(r.usageKind, (byKind.get(r.usageKind) ?? 0) + 1);
    for (const [k, v] of byKind) console.log(`  ${k}: ${v}`);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
