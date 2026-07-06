import * as path from "path";
import { promises as fs } from "fs";
import { writeFile } from "./fs";
import { toNameVariants } from "./naming";
import type { IconOutputEntry } from "../process-icons";
import type { MaterialOutputEntry } from "../process-materials";
import type { IconEntry, AssetEntry, IconWeight, IconClass } from "../../src/types";

interface IconTagData {
  pascal_name: string;
  tags: string[];
}

const ICON_WEIGHTS: IconWeight[] = ["regular", "thin", "light", "bold", "fill", "duotone"];

async function loadIconTags(baseDir: string): Promise<Map<string, string[]>> {
  const tagsFilePath = path.join(baseDir, "src", "icon-tags.json");
  const tagsMap = new Map<string, string[]>();

  try {
    const tagsData: IconTagData[] = JSON.parse(
      await fs.readFile(tagsFilePath, "utf-8"),
    );
    for (const item of tagsData) {
      tagsMap.set(item.pascal_name, item.tags);
    }
    console.log(`📋 [catalog] Loaded ${tagsMap.size} icon tags from icon-tags.json`);
  } catch (error) {
    console.warn(
      `⚠️  [catalog] Failed to load icon-tags.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return tagsMap;
}

function deriveIconClass(collection: string, weights: IconWeight[]): IconClass {
  if (collection === "special") return "special";
  const count = new Set(weights).size;
  if (count >= 6) return "full";
  if (count >= 2) return "partial";
  return "single";
}

function sortWeights(weights: IconWeight[]): IconWeight[] {
  const order = new Map(ICON_WEIGHTS.map((w, idx) => [w, idx]));
  const unique = Array.from(new Set(weights));
  return unique.sort((a, b) => {
    const ai = order.get(a) ?? ICON_WEIGHTS.length;
    const bi = order.get(b) ?? ICON_WEIGHTS.length;
    return ai - bi;
  });
}

export async function updateCatalog(options: {
  icons: IconOutputEntry[];
  materials: MaterialOutputEntry[];
  baseDir?: string;
}): Promise<void> {
  const baseDir = options.baseDir ?? path.join(__dirname, "..", "..");
  const srcDir = path.join(baseDir, "src");

  await fs.mkdir(srcDir, { recursive: true });

  const tagsMap = await loadIconTags(baseDir);

  // 按 (collection, kebab_name) 分组
  const iconMap = new Map<string, IconEntry>();
  for (const icon of options.icons) {
    const key = `${icon.collection}:${icon.kebab_name}`;
    const existing = iconMap.get(key);
    if (existing) {
      if (!existing.weights.includes(icon.weight)) {
        existing.weights.push(icon.weight);
      }
      if (icon.original_name !== icon.kebab_name && !existing.alias) {
        const { pascal: originalPascal } = toNameVariants(icon.original_name);
        existing.alias = {
          name: icon.original_name,
          pascal_name: originalPascal,
        };
      }
      if (!existing.tags || existing.tags.length === 0) {
        const tags = tagsMap.get(existing.pascal_name);
        if (tags && tags.length > 0) {
          existing.tags = tags;
        }
      }
    } else {
      const entry: IconEntry = {
        collection: icon.collection,
        name: icon.kebab_name,
        pascal_name: icon.pascal_name,
        weights: [icon.weight],
      };
      if (icon.original_name !== icon.kebab_name) {
        const { pascal: originalPascal } = toNameVariants(icon.original_name);
        entry.alias = {
          name: icon.original_name,
          pascal_name: originalPascal,
        };
      }
      const tags = tagsMap.get(icon.pascal_name);
      if (tags && tags.length > 0) {
        entry.tags = tags;
      }
      iconMap.set(key, entry);
    }
  }

  // 收尾：排序权重 + 派生 iconClass
  const iconEntries: IconEntry[] = Array.from(iconMap.values())
    .map((entry) => ({
      ...entry,
      weights: sortWeights(entry.weights),
      iconClass: deriveIconClass(entry.collection, entry.weights),
    }))
    .sort((a, b) => {
      const c = a.collection.localeCompare(b.collection);
      if (c !== 0) return c;
      return a.name.localeCompare(b.name);
    });

  const assetEntries: AssetEntry[] = options.materials
    .map((material) => ({
      type: material.type,
      name: material.kebab_name,
      pascal_name: material.pascal_name,
      alias: material.alias,
      files: material.files,
    }))
    .sort((a, b) => {
      const typeCompare = a.type.localeCompare(b.type);
      if (typeCompare !== 0) return typeCompare;
      return a.name.localeCompare(b.name);
    });

  await generateIconsFile(srcDir, iconEntries);
  // 防御性：仅当本次确有 materials 数据时才覆写 assets.ts，避免独立跑 icons 时清空
  if (assetEntries.length > 0) {
    await generateAssetsFile(srcDir, assetEntries);
  }

  const byCollection = new Map<string, number>();
  for (const e of iconEntries) {
    byCollection.set(e.collection, (byCollection.get(e.collection) ?? 0) + 1);
  }
  console.log(`📝 [catalog] Updated icons.ts (${iconEntries.length} entries)`);
  for (const [c, n] of [...byCollection.entries()].sort()) {
    console.log(`    ${c}: ${n}`);
  }
  if (assetEntries.length > 0) {
    console.log(`📝 [catalog] Updated assets.ts (${assetEntries.length} entries)`);
  } else {
    console.log(`⏭️  [catalog] Skipped assets.ts (no materials in this run)`);
  }
}

async function generateIconsFile(srcDir: string, icons: IconEntry[]): Promise<void> {
  const filePath = path.join(srcDir, "icons.ts");

  let content = `import type { IconEntry } from "./types";

/**
 * 图标元数据列表
 *
 * 此文件由 scripts/process-all.ts 自动生成，请勿手动编辑
 */
export const icons = <const>[
`;

  for (const icon of icons) {
    const weightsStr = icon.weights.map((w) => `"${w}"`).join(", ");
    const aliasStr = icon.alias
      ? `\n    alias: { name: "${icon.alias.name}", pascal_name: "${icon.alias.pascal_name}" },`
      : "";
    const tagsStr =
      icon.tags && icon.tags.length > 0
        ? `\n    tags: [${icon.tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(", ")}],`
        : "";
    const classStr = icon.iconClass ? `\n    iconClass: "${icon.iconClass}",` : "";

    content += `  {
    collection: "${icon.collection}",
    name: "${icon.name}",
    pascal_name: "${icon.pascal_name}",${aliasStr}${tagsStr}${classStr}
    weights: [${weightsStr}],
  },
`;
  }

  content += `] satisfies readonly IconEntry[];

/**
 * 根据 collection + name 查找图标
 */
export function findIcon(name: string, collection?: string): IconEntry | undefined {
  return icons.find((icon) => {
    if (collection && icon.collection !== collection) return false;
    return icon.name === name || icon.alias?.name === name;
  });
}

/**
 * 根据 PascalCase 名称查找图标
 */
export function findIconByPascalName(pascalName: string, collection?: string): IconEntry | undefined {
  return icons.find((icon) => {
    if (collection && icon.collection !== collection) return false;
    return icon.pascal_name === pascalName || icon.alias?.pascal_name === pascalName;
  });
}

/**
 * 获取所有图标名称（按 collection 可选过滤）
 */
export function getAllIconNames(collection?: string): string[] {
  const filtered = collection ? icons.filter((i) => i.collection === collection) : icons;
  return filtered.map((icon) => icon.name);
}

/**
 * 获取指定 collection 下的所有图标
 */
export function getIconsByCollection(collection: string): IconEntry[] {
  return icons.filter((icon) => icon.collection === collection);
}
`;

  await writeFile(filePath, content);
}

async function generateAssetsFile(srcDir: string, assets: AssetEntry[]): Promise<void> {
  const filePath = path.join(srcDir, "assets.ts");

  let content = `import type { AssetEntry } from "./types";

/**
 * 素材元数据列表
 *
 * 此文件由 scripts/process-all.ts 自动生成，请勿手动编辑
 */
export const assets = <const>[
`;

  for (const asset of assets) {
    const aliasStr = asset.alias
      ? `\n    alias: { name: "${asset.alias.name}", pascal_name: "${asset.alias.pascal_name}" },`
      : "";
    const filesStr = asset.files
      .map((f) => `      { format: "${f.format}", path: "${f.path}" }`)
      .join(",\n");

    content += `  {
    type: "${asset.type}",
    name: "${asset.name}",
    pascal_name: "${asset.pascal_name}",${aliasStr}
    files: [
${filesStr}
    ],
  },
`;
  }

  content += `] satisfies readonly AssetEntry[];

export function findAsset(type: string, name: string): AssetEntry | undefined {
  return assets.find(
    (asset) => asset.type === type && (asset.name === name || asset.alias?.name === name)
  );
}

export function getAssetsByType(type: string): AssetEntry[] {
  return assets.filter((asset) => asset.type === type);
}

export function getAllAssetTypes(): string[] {
  return Array.from(new Set(assets.map((asset) => asset.type)));
}
`;

  await writeFile(filePath, content);
}
