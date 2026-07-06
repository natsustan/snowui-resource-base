/**
 * @snowui-design-system/resource-base
 *
 * SnowUI Design Resource Base
 * 提供设计素材元数据、跨图标库映射与解析能力。
 */

// 类型
export type {
  IconEntry,
  AssetEntry,
  IconWeight,
  IconClass,
  IconCollectionMeta,
  IconMappingEntry,
  ResolvedIcon,
} from "./types";

// 图标元数据
export {
  icons,
  findIcon,
  findIconByPascalName,
  getAllIconNames,
  getIconsByCollection,
} from "./icons";

// 素材元数据
export {
  assets,
  findAsset,
  getAssetsByType,
  getAllAssetTypes,
} from "./assets";

// Collections
export {
  collections,
  findCollection,
  listCollectionIds,
} from "./collections";

// 跨库映射
export {
  iconMappings,
  findIconMapping,
  listUsageIcons,
} from "./icon-mappings";

// 权重相似匹配
export { WEIGHT_SIMILARITY, resolveWeight } from "./weight-similarity";

// 解析器
export { resolveIcon, resolveIconAsync, listResolutions } from "./icon-resolver";

// Iconify 同步元数据（仅图标名索引，不含 SVG body）
export {
  iconifyCollections,
  findIconifyCollection,
  hasIconifyIcon,
  type IconifyCollectionMeta,
} from "./iconify-collections";
