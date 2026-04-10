#!/bin/bash
set -euo pipefail

# 打包发布版本（只含运行时必要文件，不含源码和开发依赖）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/../cc-workspace-manager-release.tar.gz"

echo "构建生产产物..."
cd "$SCRIPT_DIR"
npm run build

echo "打包发布文件..."
tar -czf "$OUTPUT" \
  --exclude=".git" \
  --exclude="node_modules/.cache" \
  --exclude="client/node_modules" \
  --exclude="*.log" \
  --exclude=".omc/logs" \
  -C "$(dirname "$SCRIPT_DIR")" \
  cc-workspace-manager/dist \
  cc-workspace-manager/node_modules \
  cc-workspace-manager/package.json \
  cc-workspace-manager/install.sh

chmod +x "$SCRIPT_DIR/install.sh"

echo ""
echo "✅ 打包完成：$OUTPUT"
echo "   大小：$(du -sh "$OUTPUT" | cut -f1)"
echo ""
echo "分发方式："
echo "  1. 将 cc-workspace-manager-release.tar.gz 上传到共享位置"
echo "  2. 团队成员下载后执行："
echo "     tar -xzf cc-workspace-manager-release.tar.gz"
echo "     cd cc-workspace-manager && bash install.sh"
