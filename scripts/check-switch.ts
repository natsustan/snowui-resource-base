import * as path from "path";
import { promises as fs } from "fs";
import { scanUsages, type UsageRecord } from "./scan-usage";
import { icons } from "../src/icons";
import { collections, findCollection } from "../src/collections";
import { resolveIcon } from "../src/icon-resolver";
import type { IconEntry, ResolvedIcon, IconWeight } from "../src/types";

type Bucket = "matched" | "degraded" | "fallback" | "missing" | "preserved";

interface SwitchEntry {
  source: {
    file: string;
    symbol: string;
    usageKind: UsageRecord["usageKind"];
  };
  current?: {
    collection: string;
    iconName: string;
    usageName?: string;
  };
  target?: {
    collection: string;
    iconName: string;
    weight: IconWeight;
    path?: string;
    degradedReason?: string;
  };
  bucket: Bucket;
  reason?: string;
}

interface SwitchReport {
  from: string | "any";
  to: string;
  generatedAt: string;
  roots: string[];
  scannedFiles: number;
  summary: Record<Bucket, number>;
  entries: SwitchEntry[];
}

/** 给定 PascalCase 组件名，找在 icons.ts 中所属的 (collection, name)。
 *  扁平导入时若多个 collection 都有同名 PascalName，按优先级 snowui > phosphor > special 取第一个。
 */
const COLLECTION_PRIORITY = ["snowui", "phosphor", "special"];
function lookupByPascal(symbol: string): IconEntry[] {
  const matches = icons.filter((i) => i.pascal_name === symbol);
  return matches.sort((a, b) => {
    const ai = COLLECTION_PRIORITY.indexOf(a.collection);
    const bi = COLLECTION_PRIORITY.indexOf(b.collection);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function isPreserved(collection: string): boolean {
  return findCollection(collection)?.defaultPreserve === true;
}

function bucketFromResolved(
  current: { collection: string; iconName: string } | undefined,
  resolved: ResolvedIcon | undefined,
  options: { from: string | "any"; to: string },
): { bucket: Bucket; reason?: string } {
  if (current && isPreserved(current.collection)) {
    return { bucket: "preserved", reason: `source collection "${current.collection}" is preserved` };
  }
  if (!resolved) {
    return { bucket: "missing", reason: "no resolution found in target collection" };
  }
  if (resolved.collection !== options.to) {
    return { bucket: "fallback", reason: `resolved via fallback collection "${resolved.collection}"` };
  }
  if (resolved.degraded) {
    return { bucket: "degraded", reason: `weight ${resolved.degraded.requestedWeight} -> ${resolved.degraded.actualWeight} (${resolved.degraded.reason})` };
  }
  return { bucket: "matched" };
}

export interface CheckSwitchOptions {
  /** 扫描根 */
  roots: string[];
  /** 来源 collection 过滤（"any" 时不过滤） */
  from?: string;
  /** 目标 collection */
  to: string;
  /** 默认请求 weight */
  weight?: IconWeight;
  /** fallback collection 顺序 */
  fallbackCollections?: string[];
  /** 输出报告目录，默认 resource-base/reports */
  reportDir?: string;
}

export async function checkSwitch(options: CheckSwitchOptions): Promise<SwitchReport> {
  const usages = await scanUsages({ roots: options.roots });

  const entries: SwitchEntry[] = [];
  const summary: Record<Bucket, number> = {
    matched: 0,
    degraded: 0,
    fallback: 0,
    missing: 0,
    preserved: 0,
  };

  for (const u of usages) {
    // 只处理图标类用法
    if (u.usageKind === "namespace-import") continue;

    // 推断当前 (collection, iconName)
    let current: { collection: string; iconName: string; usageName?: string } | undefined;
    let usageNameForResolve: string | undefined;

    if (u.usageKind === "icon-component") {
      // <Icon name="..." collection?="..." />：usageName 就是 symbol
      usageNameForResolve = u.symbol;
      if (u.explicitCollection) {
        current = { collection: u.explicitCollection, iconName: u.symbol, usageName: u.symbol };
      } else {
        // 走默认（取扁平默认即第一优先 collection 中存在该 kebab）
        const entry = icons.find(
          (i) => i.name === u.symbol &&
            COLLECTION_PRIORITY.includes(i.collection),
        );
        if (entry) {
          current = { collection: entry.collection, iconName: entry.name, usageName: entry.name };
        }
      }
    } else if (u.usageKind === "named-import") {
      // 例：import { DotCircle } from "@.../resource-svelte"
      // 用 PascalName 反查 (collection, name)
      const matched = lookupByPascal(u.symbol);
      if (matched.length > 0) {
        const top = matched[0];
        current = { collection: top.collection, iconName: top.name, usageName: top.name };
        usageNameForResolve = top.name;
      }
    } else if (u.usageKind === "namespace-access") {
      // 例：snowui.Clipboard
      const prefix = u.namespacePrefix!;
      const matched = icons.find(
        (i) => i.collection === prefix && i.pascal_name === u.symbol,
      );
      if (matched) {
        current = { collection: matched.collection, iconName: matched.name, usageName: matched.name };
        usageNameForResolve = matched.name;
      }
    }

    // 来源过滤
    if (options.from && options.from !== "any" && current && current.collection !== options.from) {
      continue;
    }
    if (!current && options.from && options.from !== "any") {
      continue; // 推不出来源，无法判断是否属于 from
    }

    // 模拟解析
    const resolved = usageNameForResolve
      ? resolveIcon(usageNameForResolve, {
          collection: options.to,
          weight: options.weight,
          fallbackCollections: options.fallbackCollections,
        })
      : undefined;

    const { bucket, reason } = bucketFromResolved(current, resolved, {
      from: options.from ?? "any",
      to: options.to,
    });
    summary[bucket]++;

    entries.push({
      source: { file: u.file, symbol: u.symbol, usageKind: u.usageKind },
      current,
      target: resolved
        ? {
            collection: resolved.collection,
            iconName: resolved.iconName,
            weight: resolved.weight,
            path: resolved.path,
            degradedReason: resolved.degraded
              ? `${resolved.degraded.requestedWeight}->${resolved.degraded.actualWeight}:${resolved.degraded.reason}`
              : undefined,
          }
        : undefined,
      bucket,
      reason,
    });
  }

  const report: SwitchReport = {
    from: options.from ?? "any",
    to: options.to,
    generatedAt: new Date().toISOString(),
    roots: options.roots.map((r) => path.resolve(r)),
    scannedFiles: new Set(usages.map((u) => u.file)).size,
    summary,
    entries,
  };

  const reportDir = options.reportDir ?? path.join(__dirname, "..", "reports");
  await fs.mkdir(reportDir, { recursive: true });
  const stem = `switch-check-${options.from ?? "any"}-to-${options.to}`;
  await fs.writeFile(path.join(reportDir, `${stem}.json`), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(reportDir, `${stem}.md`), renderMarkdown(report));

  return report;
}

function renderMarkdown(report: SwitchReport): string {
  const lines: string[] = [];
  lines.push(`# Switch Check Report`);
  lines.push("");
  lines.push(`- From: \`${report.from}\``);
  lines.push(`- To: \`${report.to}\``);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Roots: ${report.roots.map((r) => `\`${r}\``).join(", ")}`);
  lines.push(`- Files scanned: ${report.scannedFiles}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Bucket | Count |`);
  lines.push(`| --- | --- |`);
  for (const [k, v] of Object.entries(report.summary)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  for (const bucket of ["missing", "fallback", "degraded", "preserved", "matched"] as Bucket[]) {
    const filtered = report.entries.filter((e) => e.bucket === bucket);
    if (filtered.length === 0) continue;
    lines.push(`## ${bucket} (${filtered.length})`);
    lines.push("");
    for (const e of filtered.slice(0, 100)) {
      const cur = e.current ? `${e.current.collection}:${e.current.iconName}` : "?";
      const tgt = e.target ? `${e.target.collection}:${e.target.iconName}@${e.target.weight}` : "—";
      lines.push(`- \`${path.basename(e.source.file)}\` · ${e.source.usageKind} \`${e.source.symbol}\` · ${cur} → ${tgt}${e.reason ? `  _(${e.reason})_` : ""}`);
    }
    if (filtered.length > 100) lines.push(`- … (${filtered.length - 100} more, see JSON report)`);
    lines.push("");
  }
  return lines.join("\n");
}

if (require.main === module) {
  (async () => {
    // 简单 CLI
    const args = process.argv.slice(2);
    let from: string | undefined;
    let to: string | undefined;
    let weight: IconWeight | undefined;
    const roots: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--from") from = args[++i];
      else if (a === "--to") to = args[++i];
      else if (a === "--weight") weight = args[++i] as IconWeight;
      else if (a === "--scope") roots.push(...args[++i].split(","));
      else roots.push(a);
    }
    if (!to) {
      console.error("usage: check-switch --to <collection> [--from <collection>] [--weight <w>] --scope <paths,comma>");
      process.exit(1);
    }
    const report = await checkSwitch({
      from: from ?? "any",
      to,
      weight,
      roots: roots.length > 0 ? roots : [path.resolve(__dirname, "..", "..", "playground")],
    });
    console.log(`\n[check-switch] from=${report.from} to=${report.to}`);
    console.log(`  scanned files: ${report.scannedFiles}`);
    for (const [k, v] of Object.entries(report.summary)) {
      console.log(`  ${k.padEnd(10)} ${v}`);
    }
    console.log(`  reports/switch-check-${report.from}-to-${report.to}.{json,md}`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
