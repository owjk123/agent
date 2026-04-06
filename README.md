# InkOS 移动端

基于 InkOS v0.3.5 的 AI 多智能体小说创作系统 Android APP。使用 Capacitor 将 React 移动端界面打包为原生 APK。

## 功能特性

- 📚 作品管理（创建、书架、章节统计）
- ✍️ AI 写作（调用 BaiShan API 生成小说章节）
- 🎭 题材支持：玄幻 / 仙侠 / 都市 / 恐怖 / 同人 / 科幻
- ⚙️ API 配置灵活可调

## 技术栈

| 层级 | 技术 |
|------|------|
| 界面 | React 18 + TypeScript + Vite |
| 移动端 | Capacitor 8.3.0 |
| 内核 | InkOS v0.3.5 创作铁律 |
| AI 接口 | BaiShan API（OpenAI 兼容） |

## 快速开始

### 本地开发

```bash
npm install
npm run dev          # 开发模式
npm run build        # 构建 Web
npx cap sync android # 同步到 Android
npx cap open android # 用 Android Studio 打开
```

### 首次打包 APK（Android Studio）

```bash
# 1. 安装依赖
npm install

# 2. 构建 Web
npm run build

# 3. 添加 Android 平台
npx cap add android

# 4. 同步
npx cap sync android

# 5. 用 Android Studio 打开项目
npx cap open android
# 在 Android Studio 中点击 Build → Generate Signed Bundle / APK → APK
```

## API 配置

在 APP 内 **设置** 页面填写：

| 配置项 | 值 |
|--------|-----|
| API Key | 在 ai.baishan.com 获取 |
| Base URL | `https://ai.baishan.com/v1` |
| 模型名称 | `baishan-llama`（或查看市场可用模型） |

## 自动构建（GitHub Actions）

### 首次配置签名（发布版 APK）

1. 生成 keystore：
   ```bash
   keytool -genkey -v -keystore inkos-release.keystore -alias inkos -keyalg RSA -keysize 2048 -validity 10000
   ```

2. 将 keystore 文件转为 Base64 并添加为 GitHub Secrets：
   ```bash
   base64 inkos-release.keystore | pbcopy  # macOS
   ```

3. 在 GitHub 仓库 Settings → Secrets 添加：
   - `KEYSTORE_BASE64` - keystore 的 Base64 编码
   - `KEYSTORE_PASSWORD` - keystore 密码
   - `KEY_ALIAS` - key alias（填 `inkos`）
   - `KEY_PASSWORD` - key 密码

### 工作流说明

| Workflow | 触发条件 | 产物 |
|----------|----------|------|
| `build-apk`（Debug） | push / PR / 手动 | `InkOS-Mobile-debug-APK` |
| `build-release`（Release） | push 到 main 分支 | `InkOS-Mobile-release-APK` |

下载 Artifact 后，在 GitHub Actions 页面直接下载生成的 APK 文件。

## 项目结构

```
inkos-mobile/
├── src/                    # React 源码
│   ├── App.tsx             # 主应用组件
│   └── App.css            # 样式
├── android/                # Capacitor Android 项目
├── .github/workflows/       # GitHub Actions 配置
├── capacitor.config.ts      # Capacitor 配置
├── package.json
└── vite.config.ts
```

## License

MIT
