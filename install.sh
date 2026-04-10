#!/bin/bash
set -euo pipefail

# ─── 颜色 ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ─── 配置 ────────────────────────────────────────────────────────────────────
GITHUB_REPO="LAwLi3t-CN/cc-workspace-manager"
RELEASE_TAG="${CC_VERSION:-latest}"           # 可用环境变量覆盖版本
INSTALL_DIR="$HOME/cc-workspace-manager"
PLIST_LABEL="com.ccworkspace.manager"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
PORT=47890
LOG_DIR="$INSTALL_DIR/.omc/logs"

echo ""
echo "  CC Workspace Manager — 安装程序"
echo "  ================================"
echo ""

# ─── 判断运行模式 ─────────────────────────────────────────────────────────────
# curl | bash 时 BASH_SOURCE[0] 为空或为 "bash"；本地运行时为脚本路径
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "bash" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # 本地模式：脚本所在目录有 dist/ 则直接用，否则也走下载
  if [[ -d "$SCRIPT_DIR/dist" ]]; then
    MODE="local"
  else
    MODE="download"
  fi
else
  SCRIPT_DIR=""
  MODE="download"
fi

info "安装模式：$MODE"

# ─── 1. 检查 Node.js ─────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  error "未找到 Node.js。请先安装 Node.js 18+：https://nodejs.org"
fi

NODE_VERSION=$(node -e "console.log(parseInt(process.versions.node.split('.')[0]))")
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js 版本过低（当前 $(node -v)），需要 v18+。请升级：https://nodejs.org"
fi
info "Node.js $(node -v) ✓"

# ─── 2. 停止已有服务 ──────────────────────────────────────────────────────────
if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
  warn "检测到已有服务，先停止..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# ─── 3. 获取项目文件 ──────────────────────────────────────────────────────────
if [[ "$MODE" == "download" ]]; then
  # 解析 latest Release 下载 URL
  if [[ "$RELEASE_TAG" == "latest" ]]; then
    info "查询最新 Release..."
    if ! command -v curl &>/dev/null; then
      error "未找到 curl，无法下载"
    fi
    RELEASE_URL=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
      | grep '"browser_download_url"' \
      | grep '\.tar\.gz' \
      | head -1 \
      | sed 's/.*"browser_download_url": "\(.*\)"/\1/')
    if [[ -z "$RELEASE_URL" ]]; then
      error "未找到 Release 下载包。请检查 https://github.com/${GITHUB_REPO}/releases"
    fi
  else
    RELEASE_URL="https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}/cc-workspace-manager-release.tar.gz"
  fi

  info "下载：$RELEASE_URL"
  TMP_DIR=$(mktemp -d)
  trap "rm -rf $TMP_DIR" EXIT

  curl -fsSL "$RELEASE_URL" -o "$TMP_DIR/release.tar.gz"
  tar -xzf "$TMP_DIR/release.tar.gz" -C "$TMP_DIR"

  # 找到解压后的目录
  EXTRACTED=$(find "$TMP_DIR" -maxdepth 1 -mindepth 1 -type d | head -1)
  [[ -z "$EXTRACTED" ]] && error "解压失败，包内容异常"

  info "安装到 $INSTALL_DIR ..."
  rm -rf "$INSTALL_DIR"
  mv "$EXTRACTED" "$INSTALL_DIR"

elif [[ "$MODE" == "local" ]]; then
  if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
    info "安装到 $INSTALL_DIR ..."
    rm -rf "$INSTALL_DIR"
    cp -R "$SCRIPT_DIR" "$INSTALL_DIR"
  else
    info "已在安装目录，跳过复制"
  fi
fi

# ─── 4. 创建日志目录 ──────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ─── 5. 查找 node 路径 ───────────────────────────────────────────────────────
NODE_BIN="$(command -v node)"
info "Node 路径：$NODE_BIN"

# ─── 6. 生成 LaunchAgent plist ───────────────────────────────────────────────
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${INSTALL_DIR}/dist/server/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${PORT}</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/server.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/server.error.log</string>
</dict>
</plist>
EOF
info "LaunchAgent 已生成：$PLIST_PATH"

# ─── 7. 注册并启动服务 ────────────────────────────────────────────────────────
launchctl load "$PLIST_PATH"
info "服务已启动"

# ─── 8. 等待服务就绪 ──────────────────────────────────────────────────────────
echo -n "  等待服务启动"
for i in {1..15}; do
  if curl -sf "http://localhost:${PORT}/api/health" &>/dev/null; then
    echo ""
    info "服务就绪 ✓"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 15 ]; then
    echo ""
    warn "服务启动超时，请查看日志：tail -f ${LOG_DIR}/server.error.log"
  fi
done

# ─── 9. 完成 ─────────────────────────────────────────────────────────────────
echo ""
echo "  ✅ 安装完成！"
echo ""
echo "  访问地址：http://localhost:${PORT}"
echo "  开机自动启动，无需手动操作"
echo ""
echo "  常用命令："
echo "    停止：launchctl unload ~/Library/LaunchAgents/${PLIST_LABEL}.plist"
echo "    启动：launchctl load  ~/Library/LaunchAgents/${PLIST_LABEL}.plist"
echo "    日志：tail -f ${LOG_DIR}/server.log"
echo ""

open "http://localhost:${PORT}" 2>/dev/null || true
