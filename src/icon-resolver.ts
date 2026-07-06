import type { IconWeight, ResolvedIcon, IconEntry, IconMappingEntry } from "./types";
import { collections, findCollection } from "./collections";
import { icons } from "./icons";
import { iconMappings, findIconMapping } from "./icon-mappings";
import { resolveWeight } from "./weight-similarity";

interface ResolveOptions {
  collection?: string;
  weight?: IconWeight;
  /** 解析失败时的 fallback collection 顺序 */
  fallbackCollections?: string[];
}

interface ResolveAsyncOptions extends ResolveOptions {
  allowRemote?: boolean;
}

/** 内部：按 collection + iconName 找 IconEntry */
function findEntry(collection: string, iconName: string): IconEntry | undefined {
  return icons.find((i) => i.collection === collection && i.name === iconName);
}

/** 把本地 IconEntry + 权重解析为最终 ResolvedIcon。返回 undefined 表示真不存在。 */
function resolveLocal(
  usageName: string,
  collection: string,
  iconName: string,
  requested: IconWeight,
  mappingStatus?: ResolvedIcon["status"],
  weightMap?: Partial<Record<IconWeight, IconWeight>>,
): ResolvedIcon | undefined {
  const col = findCollection(collection);
  if (!col) return undefined;
  const entry = findEntry(collection, iconName);
  if (!entry) return undefined;

  // 优先用 collection 自定义 weightMap
  let finalWeight: IconWeight = requested;
  let degraded: ResolvedIcon["degraded"];
  if (weightMap && weightMap[requested] && entry.weights.includes(weightMap[requested] as IconWeight)) {
    finalWeight = weightMap[requested] as IconWeight;
    if (finalWeight !== requested) {
      degraded = { requestedWeight: requested, actualWeight: finalWeight, reason: "collection-weightmap" };
    }
  } else {
    const w = resolveWeight(requested, entry.weights, col.defaultWeight);
    finalWeight = w.weight;
    if (w.reason) {
      degraded = { requestedWeight: requested, actualWeight: finalWeight, reason: w.reason };
    }
  }

  const pathInAssets =
    collection === "special"
      ? `icons/${collection}/${iconName}.svg`
      : `icons/${collection}/${finalWeight}/${iconName}.svg`;

  return {
    usageName,
    collection,
    iconName,
    weight: finalWeight,
    path: pathInAssets,
    source: "local",
    status: mappingStatus ?? "matched",
    degraded,
  };
}

/**
 * 同步解析（仅本地资源）
 *
 * 优先级：
 * 1. usageName 命中映射 → 取目标 collection 的 iconName
 * 2. 未命中映射但 collection + name 直接存在于本地 icons.ts → 视作直连
 * 3. 按 fallbackCollections 顺序重试
 */
export function resolveIcon(usageName: string, options: ResolveOptions = {}): ResolvedIcon | undefined {
  const requestedWeight = options.weight ?? "regular";
  const targetCollection = options.collection ?? collections[0].id;

  // 1. 走映射
  const mapping = findIconMapping(usageName);
  if (mapping) {
    const entry = mapping.collections[targetCollection];
    if (entry) {
      const resolved = resolveLocal(
        usageName,
        targetCollection,
        entry.iconName,
        requestedWeight,
        entry.status,
        entry.weightMap,
      );
      if (resolved) return resolved;
    }
    // 走 mapping.fallback
    for (const fb of mapping.fallback ?? []) {
      const resolved = resolveLocal(usageName, fb.collection, fb.iconName, requestedWeight);
      if (resolved) return resolved;
    }
  }

  // 2. 直连尝试：usageName 本身就是某 collection 的图标名
  const direct = resolveLocal(usageName, targetCollection, usageName, requestedWeight);
  if (direct) return direct;

  // 3. fallbackCollections
  for (const fb of options.fallbackCollections ?? []) {
    if (fb === targetCollection) continue;
    if (mapping) {
      const entry = mapping.collections[fb];
      if (entry) {
        const resolved = resolveLocal(usageName, fb, entry.iconName, requestedWeight, entry.status, entry.weightMap);
        if (resolved) return resolved;
      }
    }
    const fbDirect = resolveLocal(usageName, fb, usageName, requestedWeight);
    if (fbDirect) return fbDirect;
  }

  return undefined;
}

/**
 * 异步解析（含远程 Iconify 支持）。
 *
 * 当前版本：远程能力未接通，行为等同 resolveIcon（同步壳）。
 * 后续接入 iconify.ts 时，此函数负责：
 * 1. 走 resolveIcon 找本地
 * 2. 若 collection.mode = "remote"/"hybrid" 且 allowRemote，调用 iconify 客户端
 * 3. 远程失败时按 fallbackCollections 重试
 */
export async function resolveIconAsync(
  usageName: string,
  options: ResolveAsyncOptions = {},
): Promise<ResolvedIcon | undefined> {
  const local = resolveIcon(usageName, options);
  if (local) return local;

  // TODO: 当 collection.mode = "remote" 时调用 iconify.ts，参考 §8.1
  return undefined;
}

/**
 * 列出所有 collection 中能解析为给定 usageName 的候选
 */
export function listResolutions(usageName: string): ResolvedIcon[] {
  const out: ResolvedIcon[] = [];
  const mapping = findIconMapping(usageName);
  const seen = new Set<string>();
  if (mapping) {
    for (const [col, entry] of Object.entries(mapping.collections)) {
      const r = resolveLocal(usageName, col, entry.iconName, "regular", entry.status, entry.weightMap);
      if (r) {
        out.push(r);
        seen.add(`${col}:${entry.iconName}`);
      }
    }
  }
  // 直连候选
  for (const col of collections) {
    const key = `${col.id}:${usageName}`;
    if (seen.has(key)) continue;
    const r = resolveLocal(usageName, col.id, usageName, "regular");
    if (r) out.push(r);
  }
  return out;
}

// re-export for convenience
export { iconMappings, findIconMapping };
export type { ResolvedIcon, IconMappingEntry };
