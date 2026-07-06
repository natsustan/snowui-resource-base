import * as path from "path";
import { promises as fs } from "fs";
import { listAssets, writeFile } from "./utils/fs";
import { toNameVariants } from "./utils/naming";
import { processSvgFile } from "./utils/svg";

type IconWeight = "regular" | "thin" | "light" | "bold" | "fill" | "duotone";
const WEIGHTS: IconWeight[] = ["regular", "thin", "light", "bold", "fill", "duotone"];

function detectWeightFromBase(baseName: string): IconWeight {
  const m = baseName.match(/-(regular|thin|light|bold|fill|duotone)$/i);
  if (!m) return "regular";
  return m[1].toLowerCase() as IconWeight;
}

function stripWeightSuffix(baseName: string): string {
  return baseName.replace(/-(regular|thin|light|bold|fill|duotone)$/i, "");
}

export interface ProcessIconsOptions {
  /** 生成输出目录，默认 scripts 同级的 ../assets */
  baseAssetsDir?: string;
  /** 原始图标目录，默认 ../raw-assets/icons（必需，按 collection 子目录组织） */
  rawIconsDir?: string;
  /** 是否仅打印日志 */
  dryRun?: boolean;
  /** 只处理指定 collection（用于增量构建） */
  onlyCollections?: string[];
}

export interface IconOutputEntry {
  collection: string;
  kebab_name: string;
  pascal_name: string;
  /** 原始文件名（去除权重后缀后） */
  original_name: string;
  weight: IconWeight;
  /** 相对 assets 根目录路径，例如 icons/snowui/regular/dot-circle.svg 或 icons/special/docx-icon.svg */
  path: string;
  /** 是否为 special 类（无权重子目录、保留原色） */
  isSpecial: boolean;
}

// 检查是否仅包含黑/白（含透明度）颜色；若有其他颜色则应保留原始文件
function isMonochromeBlackWhite(svg: string): boolean {
  const colorPattern = /(#(?:[0-9a-fA-F]{3,8}))|rgba?\s*\(\s*([0-9.\s,%]+)\s*\)|(black|white)/gi;
  let match: RegExpExecArray | null;

  const isHexMono = (hex: string): boolean => {
    let h = hex.toLowerCase();
    h = h.startsWith("#") ? h.slice(1) : h;
    if (h.length === 3) {
      h = h.split("").map((c) => c + c).join("");
    } else if (h.length === 4) {
      const rgb = h.slice(0, 3).split("").map((c) => c + c).join("");
      const a = h.slice(3).repeat(2);
      h = rgb + a;
    }
    if (h.length === 6) {
      return h === "000000" || h === "ffffff";
    }
    if (h.length === 8) {
      const rgb = h.slice(0, 6);
      return rgb === "000000" || rgb === "ffffff";
    }
    return false;
  };

  const isRgbMono = (nums: string): boolean => {
    const parts = nums.split(",").map((v) => v.trim()).filter(Boolean);
    if (parts.length < 3) return false;
    const rgb = parts.slice(0, 3).map((p) => {
      if (p.endsWith("%")) return Math.round((parseFloat(p) / 100) * 255);
      return parseFloat(p);
    });
    const [r, g, b] = rgb;
    return (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255);
  };

  while ((match = colorPattern.exec(svg)) !== null) {
    const [, hex, rgbNums, named] = match;
    if (hex) {
      if (!isHexMono(hex)) return false;
    } else if (rgbNums) {
      if (!isRgbMono(rgbNums)) return false;
    } else if (named) {
      const n = named.toLowerCase();
      if (n !== "black" && n !== "white") return false;
    }
  }
  return true;
}

async function discoverCollections(rawIconsDir: string): Promise<string[]> {
  const entries = await fs.readdir(rawIconsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export async function processIcons(options: ProcessIconsOptions = {}): Promise<IconOutputEntry[]> {
  const baseAssetsDir = options.baseAssetsDir ?? path.join(__dirname, "..", "assets");
  const rawIconsDir = options.rawIconsDir ?? path.join(__dirname, "..", "raw-assets", "icons");

  const hasRaw = await fs.access(rawIconsDir).then(() => true).catch(() => false);
  if (!hasRaw) {
    console.warn(`[icons] skip: raw icons directory not found at ${rawIconsDir}`);
    return [];
  }

  const collections = await discoverCollections(rawIconsDir);
  if (collections.length === 0) {
    console.warn(`[icons] skip: no collection subdirectories under ${rawIconsDir}`);
    return [];
  }

  const targetCollections = options.onlyCollections && options.onlyCollections.length > 0
    ? collections.filter((c) => options.onlyCollections!.includes(c))
    : collections;

  const outputs: IconOutputEntry[] = [];

  for (const collection of targetCollections) {
    const collectionDir = path.join(rawIconsDir, collection);
    const isSpecial = collection === "special";

    // special collection: 文件直接位于 collection 根目录，全部视为 regular，保留原色
    // 其他 collection: 文件可以平铺（用文件名后缀识别 weight），未来可扩展为按 weight 子目录
    const files = await listAssets(collectionDir, [".svg"], false);

    for (const file of files) {
      const weight: IconWeight = isSpecial ? "regular" : detectWeightFromBase(file.baseName);
      const nameBase = isSpecial ? file.baseName : stripWeightSuffix(file.baseName);
      const { kebab, pascal, original } = toNameVariants(nameBase);

      const outRel = isSpecial
        ? path.join("icons", collection, `${kebab}.svg`)
        : path.join("icons", collection, weight, `${kebab}.svg`);
      const outAbs = path.join(baseAssetsDir, outRel);

      if (!options.dryRun) {
        await fs.mkdir(path.dirname(outAbs), { recursive: true });
        const rawContent = await fs.readFile(file.path, "utf8");
        // special 类不做颜色处理，永远保留原始 SVG
        if (isSpecial) {
          await writeFile(outAbs, rawContent);
        } else if (!isMonochromeBlackWhite(rawContent)) {
          // 非黑白图标也保留原始内容（与旧行为一致）
          await writeFile(outAbs, rawContent);
        } else {
          const processedSvg = await processSvgFile(file.path);
          await writeFile(outAbs, processedSvg);
        }
      }

      outputs.push({
        collection,
        kebab_name: kebab,
        pascal_name: pascal,
        original_name: original,
        weight,
        path: outRel,
        isSpecial,
      });
    }
  }

  return outputs;
}

if (require.main === module) {
  (async () => {
    const dryRun = process.argv.includes("--dry");
    const outputs = await processIcons({ dryRun });
    const byCollection = new Map<string, number>();
    for (const o of outputs) {
      byCollection.set(o.collection, (byCollection.get(o.collection) ?? 0) + 1);
    }
    console.log(`[icons] processed total: ${outputs.length}`);
    for (const [c, n] of [...byCollection.entries()].sort()) {
      console.log(`  ${c}: ${n}`);
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
