import type { IconWeight } from "./types";

/**
 * 跨图标库权重相似度表
 *
 * 用法：请求 weight = W，按 WEIGHT_SIMILARITY[W] 顺序在目标 collection 已有 weights 中查第一个命中。
 * 全部不命中时降级到 collection.defaultWeight（通常为 regular）。
 *
 * 详见需求文档 §13.4.y。
 */
export const WEIGHT_SIMILARITY: Record<IconWeight, IconWeight[]> = {
  thin: ["thin", "light", "regular"],
  light: ["light", "thin", "regular"],
  regular: ["regular", "light", "bold"],
  bold: ["bold", "regular", "fill"],
  fill: ["fill", "bold", "regular"],
  duotone: ["duotone", "fill", "regular"],
};

/**
 * 解析权重降级。
 * @param requested 用户请求的权重
 * @param available 目标 collection 已有权重
 * @param fallback collection 的 defaultWeight
 * @returns 实际命中的权重 + 降级原因；如果命中即请求权重，returns reason undefined
 */
export function resolveWeight(
  requested: IconWeight,
  available: IconWeight[],
  fallback: IconWeight,
): { weight: IconWeight; reason?: "weight-similarity" | "default-fallback" } {
  if (available.includes(requested)) {
    return { weight: requested };
  }
  for (const candidate of WEIGHT_SIMILARITY[requested]) {
    if (available.includes(candidate)) {
      return { weight: candidate, reason: "weight-similarity" };
    }
  }
  return { weight: fallback, reason: "default-fallback" };
}
