import * as path from "path";
import { processMaterials } from "./process-materials";
import { processIcons } from "./process-icons";
import { updateCatalog } from "./utils/catalog";

/**
 * 统一处理所有素材和图标
 * 
 * 处理顺序：
 * 1. 先处理 materials（avatars/backgrounds/cursors 等）
 *    - 位图格式（PNG、JPG 等）：进行压缩优化
 *    - SVG 格式：直接复制（不进行颜色处理）
 * 2. 再处理 icons
 *    - SVG 格式：进行颜色处理（currentColor 替换）和压缩优化
 * 
 * 处理规则：
 * - SVG 颜色处理仅应用于 icons 文件夹
 * - 图片压缩排除 icons 文件夹，只处理其他文件夹中的位图格式
 * - 如果 icons 和 materials 有重名，引用时优先使用 icons 里的素材
 * - 不同类别的 materials 之间可以重名（如 avatars 和 cursors 可以有同名文件）
 */
async function main() {
  const dryRun = process.argv.includes("--dry");
  const baseAssetsDir = path.join(__dirname, "..", "assets");
  const rawAssetsDir = path.join(__dirname, "..", "raw-assets");

  console.log("🚀 Starting asset processing...");
  console.log("");

  // Avatar 基础尺寸（1x）
  const avatarBaseSizes = [12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 128, 256, 512];
  // 扩展 3x 尺寸，并去重排序
  const avatarSizes = Array.from(
    new Set([
      ...avatarBaseSizes,
      ...avatarBaseSizes.map((s) => s * 3),
    ])
  ).sort((a, b) => a - b);

  // 步骤 1: 处理 materials（排除 icons）
  console.log("📦 Step 1: Processing materials (avatars, backgrounds, cursors, etc.)");
  console.log("   - Bitmap images (PNG, JPG, etc.): Compressing and generating multiple sizes...");
  console.log("   - SVG files: Copying as-is (no color processing, no size variants)");
  console.log("   - Avatars: Generating multiple sizes (1x & 3x)");
  console.log("   - Backgrounds: Generating multiple widths (320, 640, 1024, 1920)...");
  console.log("   - Images: Generating multiple widths (160, 320, 640, 1024)...");
  console.log("   - Illustrations: Generating multiple widths (160, 320, 640, 1024)...");
  const materials = await processMaterials({
    baseAssetsDir,
    rawAssetsDir,
    dryRun,
    excludeGroups: ["icons"],
    // Avatars: 正方形尺寸，默认 32x32（仅位图）
    multiSizeGroups: ["avatars"],
    sizes: avatarSizes,
    // Backgrounds, Images, Illustrations: 宽度固定，高度自适应（仅位图）
    multiWidthGroups: ["backgrounds", "images", "illustrations"],
    // 不同素材类型的宽度配置
    widthConfigs: {
      backgrounds: [320, 640, 1024, 1920],  // 默认 1024
      images: [160, 320, 640, 1024],        // 默认 320
      illustrations: [160, 320, 640, 1024],  // 默认 320（与 images 一致）
    },
  });
  console.log(`   ✅ Processed ${materials.length} material entries`);
  console.log("");

  // 步骤 2: 处理 icons（优先级更高）
  console.log("🎨 Step 2: Processing icons");
  console.log("   - SVG files: Color processing (currentColor) + optimization");
  const icons = await processIcons({
    baseAssetsDir,
    rawIconsDir: path.join(rawAssetsDir, "icons"),
    dryRun,
  });
  console.log(`   ✅ Processed ${icons.length} icon entries`);
  console.log("");

  // 步骤 3: 更新 catalog（元数据文件）
  console.log("📚 Step 3: Updating catalog (metadata)");
  await updateCatalog({
    icons,
    materials,
    baseDir: path.join(__dirname, ".."),
  });
  console.log("");

  console.log(`✅ [all] Complete! materials: ${materials.length}, icons: ${icons.length}`);
  console.log(`💡 Note: If duplicate names exist, icons take priority over materials.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
