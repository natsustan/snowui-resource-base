import * as path from "path";
import { promises as fs } from "fs";
import { writeFile } from "./utils/fs";
import type { IconMappingEntry, IconEntry } from "../src/types";

interface MappingSource {
  usageName: string;
  label?: string;
  category?: string;
  tags?: string[];
  fallback?: Array<{ collection: string; iconName: string }>;
  collections: Record<
    string,
    {
      iconName: string;
      weightMap?: Record<string, string>;
      transform?: { rotate?: 0 | 1 | 2 | 3; hFlip?: boolean; vFlip?: boolean };
      status?: "matched" | "approximate" | "missing" | "manual" | "suggested";
      note?: string;
    }
  >;
}

interface BuildOptions {
  baseDir?: string;
  /** 自动用同名规则补全 SnowUI ↔ Phosphor 候选映射 */
  autoSeedSnowuiPhosphor?: boolean;
}

interface BuildReport {
  totalUsageNames: number;
  totalCollections: Record<string, number>;
  missingRefs: Array<{ usageName: string; collection: string; iconName: string }>;
  autoSeeded: number;
}

/**
 * 根据 src/icons.ts 校验映射引用是否存在；不存在记入 missingRefs。
 */
function validateMapping(
  mapping: IconMappingEntry,
  iconsByCollection: Map<string, Set<string>>,
): Array<{ collection: string; iconName: string }> {
  const missing: Array<{ collection: string; iconName: string }> = [];
  for (const [col, entry] of Object.entries(mapping.collections)) {
    const set = iconsByCollection.get(col);
    if (!set || !set.has(entry.iconName)) {
      missing.push({ collection: col, iconName: entry.iconName });
    }
  }
  return missing;
}

export async function buildMappings(options: BuildOptions = {}): Promise<BuildReport> {
  const baseDir = options.baseDir ?? path.join(__dirname, "..");
  const sourcePath = path.join(baseDir, "raw-assets", "icon-mappings.source.json");
  const outPath = path.join(baseDir, "src", "icon-mappings.ts");
  const reportPath = path.join(baseDir, "reports", "icon-mappings-report.json");

  // 1. 读取人工 source（不存在则按空数组继续）
  let sources: MappingSource[] = [];
  try {
    const raw = await fs.readFile(sourcePath, "utf-8");
    sources = JSON.parse(raw);
  } catch {
    console.warn(`[mappings] no source file at ${sourcePath}, starting empty`);
  }

  // 2. 读取当前 icons.ts 以校验引用 + 用于自动补 seed
  const { icons } = (await import(path.join(baseDir, "src", "icons.ts"))) as {
    icons: readonly IconEntry[];
  };
  const iconsByCollection = new Map<string, Set<string>>();
  for (const i of icons) {
    if (!iconsByCollection.has(i.collection)) iconsByCollection.set(i.collection, new Set());
    iconsByCollection.get(i.collection)!.add(i.name);
  }

  // 3. 索引 source 中已有的 usageName，避免重复
  const usageNameSet = new Set(sources.map((s) => s.usageName));

  // 4. 自动 seed: SnowUI ↔ Phosphor 同名匹配
  let autoSeeded = 0;
  if (options.autoSeedSnowuiPhosphor !== false) {
    const snowui = iconsByCollection.get("snowui") ?? new Set();
    const phosphor = iconsByCollection.get("phosphor") ?? new Set();
    for (const name of snowui) {
      if (!phosphor.has(name)) continue;
      if (usageNameSet.has(name)) continue;
      sources.push({
        usageName: name,
        collections: {
          snowui: { iconName: name, status: "matched" },
          phosphor: { iconName: name, status: "matched" },
        },
      });
      usageNameSet.add(name);
      autoSeeded++;
    }
  }

  // 5. 排序 + 校验
  sources.sort((a, b) => a.usageName.localeCompare(b.usageName));
  const missingRefs: BuildReport["missingRefs"] = [];
  const totalCollections: Record<string, number> = {};
  for (const src of sources) {
    const missing = validateMapping(src as IconMappingEntry, iconsByCollection);
    for (const m of missing) {
      missingRefs.push({ usageName: src.usageName, ...m });
    }
    for (const col of Object.keys(src.collections)) {
      totalCollections[col] = (totalCollections[col] ?? 0) + 1;
    }
  }

  // 6. 写入 src/icon-mappings.ts
  const content = `import type { IconMappingEntry } from "./types";

/**
 * 跨图标库映射表
 *
 * 此文件由 scripts/build-mappings.ts 自动生成。
 * 编辑请改 raw-assets/icon-mappings.source.json。
 */
export const iconMappings = <const>${JSON.stringify(sources, null, 2)} satisfies readonly IconMappingEntry[];

export function findIconMapping(usageName: string): IconMappingEntry | undefined {
  return iconMappings.find((m) => m.usageName === usageName);
}

export function listUsageIcons(): readonly IconMappingEntry[] {
  return iconMappings;
}
`;
  await writeFile(outPath, content);

  // 7. 写入报告
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const report: BuildReport = {
    totalUsageNames: sources.length,
    totalCollections,
    missingRefs,
    autoSeeded,
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return report;
}

if (require.main === module) {
  (async () => {
    const report = await buildMappings();
    console.log(`[mappings] usageNames: ${report.totalUsageNames}`);
    console.log(`[mappings] auto-seeded snowui↔phosphor: ${report.autoSeeded}`);
    console.log(`[mappings] per-collection counts:`);
    for (const [c, n] of Object.entries(report.totalCollections).sort()) {
      console.log(`    ${c}: ${n}`);
    }
    if (report.missingRefs.length > 0) {
      console.log(`[mappings] ⚠️  missing refs: ${report.missingRefs.length}`);
      for (const m of report.missingRefs.slice(0, 10)) {
        console.log(`    ${m.usageName} -> ${m.collection}:${m.iconName}`);
      }
      if (report.missingRefs.length > 10) {
        console.log(`    ... and ${report.missingRefs.length - 10} more (see reports/)`);
      }
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
