import type { IconCollectionMeta } from "./types";

/**
 * 本地 / 默认 collection 注册表
 *
 * 远程图标库（如 material-symbols、lucide）由 src/remote-collections.ts 维护，
 * 此处只列出 resource-base 内打包随出的本地 collection。
 */
export const collections: readonly IconCollectionMeta[] = [
  {
    id: "snowui",
    name: "SnowUI Icons",
    source: "snowui",
    mode: "local",
    defaultWeight: "regular",
    weights: ["regular", "thin", "light", "bold", "fill", "duotone"],
    license: "Proprietary (SnowUI Design System)",
  },
  {
    id: "phosphor",
    name: "Phosphor Icons",
    source: "bundled",
    mode: "local",
    iconifyPrefix: "ph",
    defaultWeight: "regular",
    weights: ["regular", "thin", "light", "bold", "fill", "duotone"],
    license: "MIT",
    homepage: "https://phosphoricons.com",
  },
  {
    id: "special",
    name: "Special / External",
    source: "snowui",
    mode: "local",
    defaultWeight: "regular",
    weights: ["regular"],
    defaultPreserve: true,
  },
] as const;

export function findCollection(id: string): IconCollectionMeta | undefined {
  return collections.find((c) => c.id === id);
}

export function listCollectionIds(): string[] {
  return collections.map((c) => c.id);
}
