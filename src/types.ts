/**
 * 图标权重类型
 */
export type IconWeight = "regular" | "thin" | "light" | "bold" | "fill" | "duotone";

/**
 * 图标类。详见需求文档 §17.1
 * - "full" 全权重 (A 类，6 个权重)
 * - "partial" 部分权重 (B 类，regular + fill)
 * - "single" 单权重 (C 类，仅 regular)
 * - "special" 特殊/彩色/外部 (D 类，无权重维度)
 */
export type IconClass = "full" | "partial" | "single" | "special";

/**
 * 图标库（collection）元数据
 */
export interface IconCollectionMeta {
  /** 唯一 ID，例如 snowui / phosphor / special / material-symbols */
  id: string;
  /** 显示名 */
  name: string;
  /** 来源类型 */
  source: "snowui" | "bundled" | "iconify" | "external";
  /** 本地、远程或混合 */
  mode: "local" | "remote" | "hybrid";
  /** Iconify prefix（remote / hybrid 时） */
  iconifyPrefix?: string;
  /** 默认权重 */
  defaultWeight: IconWeight;
  /** 此 collection 支持的权重列表 */
  weights: IconWeight[];
  /** 是否默认进入 preserve（如 special） */
  defaultPreserve?: boolean;
  /** 授权信息 */
  license?: string;
  /** 来源主页 */
  homepage?: string;
}

/**
 * 图标条目（属于某个 collection）
 */
export interface IconEntry {
  /** 所属 collection id */
  collection: string;
  /** kebab-case 名称（collection 内唯一） */
  name: string;
  /** PascalCase 名称 */
  pascal_name: string;
  /** 原始名（若不同于 name 才填） */
  alias?: {
    name: string;
    pascal_name: string;
  };
  /** 支持的权重 */
  weights: IconWeight[];
  /** 图标类（A/B/C/D） */
  iconClass?: IconClass;
  /** 标签 */
  tags?: string[];
}

/**
 * 跨图标库映射条目（usageName -> 各 collection 的实际图标）
 */
export interface IconMappingEntry {
  /** 通用使用名 */
  usageName: string;
  /** 显示标签 */
  label?: string;
  /** 分类 */
  category?: string;
  /** 搜索标签 */
  tags?: string[];
  /** fallback 顺序，按数组顺序尝试 */
  fallback?: Array<{ collection: string; iconName: string }>;
  /** 各 collection 的具体映射 */
  collections: Record<
    string,
    {
      iconName: string;
      weightMap?: Partial<Record<IconWeight, IconWeight>>;
      transform?: {
        rotate?: 0 | 1 | 2 | 3;
        hFlip?: boolean;
        vFlip?: boolean;
      };
      status?: "matched" | "approximate" | "missing" | "manual" | "suggested";
      note?: string;
    }
  >;
}

/**
 * 解析结果
 */
export interface ResolvedIcon {
  usageName: string;
  collection: string;
  iconName: string;
  weight: IconWeight;
  path?: string;
  svg?: {
    body: string;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
  source: "local" | "iconify";
  status: "matched" | "approximate" | "missing" | "manual" | "suggested";
  /** 权重降级信息（若发生） */
  degraded?: {
    requestedWeight: IconWeight;
    actualWeight: IconWeight;
    reason: "weight-similarity" | "default-fallback" | "collection-weightmap";
  };
}

/**
 * 素材条目类型（非 icon）
 */
export interface AssetEntry {
  type: string;
  name: string;
  pascal_name: string;
  alias?: {
    name: string;
    pascal_name: string;
  };
  files: Array<{
    format: string;
    path: string;
  }>;
}
