interface NameVariants {
  /** 原始名称（不含扩展名） */
  original: string;
  /** kebab-case 名称 */
  kebab: string;
  /** PascalCase 名称 */
  pascal: string;
  /** 如果转换后与原始名称不同，则提供别名信息 */
  alias?: {
    name: string;
    pascal_name: string;
  };
}

// 切分规则：
// 1. 小写/数字 后跟 大写：foo|Bar、icon|Size → 在大写前切
// 2. 字母 后跟 数字：file2 → 在数字前切
// 3. 连续大写 后跟 大写+小写：XCircle、PDFReader → 切在最后一个大写前（X|Circle、PDF|Reader）
const WORD_BOUNDARY_LOWER_UPPER = /([a-z0-9])([A-Z])/g;
const WORD_BOUNDARY_LETTER_DIGIT = /([A-Za-z])([0-9])/g;
const WORD_BOUNDARY_CAPS_TRAIL = /([A-Z])([A-Z][a-z])/g;

/**
 * 将原始文件名转换为项目统一的命名格式
 */
export function toNameVariants(raw: string): NameVariants {
  const sanitized = raw
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .trim();

  const words = sanitized
    .replace(WORD_BOUNDARY_CAPS_TRAIL, "$1 $2") // XCircle → X Circle, PDFReader → PDF Reader
    .replace(WORD_BOUNDARY_LOWER_UPPER, "$1 $2") // fooBar → foo Bar
    .replace(WORD_BOUNDARY_LETTER_DIGIT, "$1 $2") // file2 → file 2
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

  const kebab = words.join("-");
  const pascal = words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join("");

  const lowerSanitized = sanitized.toLowerCase().replace(/\s+/g, "-");
  const alias = lowerSanitized !== kebab ? { name: sanitized, pascal_name: pascal } : undefined;

  return {
    original: raw,
    kebab,
    pascal,
    alias,
  };
}

