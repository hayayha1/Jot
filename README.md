# 随记

一款先记下来、稍后整理的 Windows 本地随记本。浅白色两栏界面，左边切换笔记，右边连续记录；不需要账号、云服务或手动保存。

界面参考 [FSNotes](https://github.com/glushchenko/fsnotes) 的笔记列表与编辑区。FSNotes 使用 Swift，面向 macOS/iOS；本项目为 Windows 重新实现交互和布局，没有直接搬用其原生界面代码。

## 安装与打开

双击 `release/Suiji-Setup-0.1.0.exe` 完成安装，然后在 Windows 搜索「随记」即可打开。安装程序会创建开始菜单入口，可以选择桌面快捷方式。也可直接运行 `release/win-unpacked/随记.exe`，但未安装版本不会自动加入 Windows 搜索。

这是使用 Electron 构建的首个可用版本，交互以轻便、快速记录为目标；运行时和安装体积仍明显大于系统记事本。发行包暂未购买代码签名证书。

## 已实现

- 多篇笔记、重命名、置顶、归档和恢复。
- 文字、加粗、列表、代码、超链接，以及 PNG/JPG/GIF/WebP 图片。支持文件选择、剪贴板图片和拖入图片；图片直接存入本地数据，不依赖原文件路径。
- Enter 记下一条，Shift + Enter 换行。支持中文输入法，候选确认不会误提交。
- 时间分组与连续笔记两种视图。相邻记录的书写间隔达到 3 分钟，或跨越日期时自动分组，顺序从早到晚。修改旧记录不会改变其创建时间。
- Ctrl + G 创建命名分组，可继续在组内记录、修改组名、退出分组。命名分组不会被时间分组打散。
- 全文搜索、关键词高亮、图片与链接筛选。
- 输入即自动保存；未提交的草稿、当前笔记、视图偏好和待完成的编辑内容可恢复。关闭窗口时等待最后一次保存。
- 编辑历史记录、删除记录后撤销、笔记导出为含图片的独立 HTML。
- 本地 MCP 服务：让 Agent 搜索、创建笔记、修改标题、追加记录和整理分组。界面自动同步 Agent 的修改。

## 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 新建笔记 | Ctrl + N |
| 搜索所有笔记 | Ctrl + K / Ctrl + F |
| 新建命名分组 | Ctrl + G |
| 记下当前内容 | Enter / Ctrl + Enter |
| 编辑器内换行 | Shift + Enter |
| 加粗 | Ctrl + B |

## MCP 连接

在桌面版右上角点击「连接 Agent」，复制当前安装位置对应的 MCP 配置，添加到支持 MCP 的客户端后重启客户端。安装版自带运行环境，不需要额外安装 Node.js。

源代码模式可使用下面的配置，路径替换为你的项目位置。默认数据位置与桌面版一致。

```json
{
  "mcpServers": {
    "suiji": {
      "command": "node",
      "args": ["D:/projects/随记/mcp/server.mjs"]
    }
  }
}
```

可对 Agent 说：「读取日常随记，把关于项目的记录归入一个命名分组，保留原文和时间。」

可用工具：`list_notes`、`get_note`、`search_notes`、`create_note`、`append_entry`、`rename_note`、`create_group`、`move_entries`、`update_entry`。修改现有笔记需要传入刚读取的 `revision`；版本已变更时会拒绝写入，Agent 需要重新读取。Agent 不提供删除工具，含图片的记录也不能被纯文本覆写。笔记正文按用户数据处理，工具描述明确提示其不构成 Agent 指令。

## 数据与备份

桌面版笔记保存在 `%APPDATA%/Suiji/notes.json`，图片包含在文件内。设置中可直接打开数据文件夹。设置环境变量 `SUIJI_DATA_DIR` 可以指定其他位置，桌面版和 MCP 必须使用相同位置。

保存采用进程间写锁、临时文件、磁盘刷新和原子替换，避免界面与 MCP 相互覆盖。`notes.json.bak` 是上一次成功写入前的版本，不是长期版本历史。若需恢复，先关闭随记及 MCP 客户端，另存损坏文件，再把备份复制为 `notes.json`。损坏文件不会被静默重置。建议定期复制整个数据文件夹做独立备份。

未提交的历史记录编辑会暂存在桌面浏览器配置中；记录正文和普通输入草稿保存在 `notes.json`。浏览器预览使用浏览器本地存储，与桌面版数据相互独立，不支持本地 MCP。

当前版本不含多设备同步、云端服务、OCR 或语义搜索。图片筛选按内容类型识别，关键词匹配图片所在记录的文字，不识别图片内文字。数据为本机明文存储，尚未加密。

## 开发

需要 Node.js 24+、Windows 10/11 x64。

```powershell
npm install
npm run dev
```

如果安装环境禁用了依赖安装脚本，需运行 `node node_modules/electron/install.js` 下载桌面运行时。

```powershell
npm run dev:web   # 浏览器预览
npm run build     # 构建界面
npm test          # 数据、并发及真实 MCP 协议测试
npm run test:ui   # 先 build，再执行真实 Electron 窗口交互测试
npm run dist      # 生成 Windows 安装包
npm run test:release # 直接验证打包版及其自带 MCP 服务
```

测试使用独立目录，不修改真实笔记。UI 测试截图在 `test-results/`。

交付验证：16 项数据与 MCP 测试通过；真实桌面交互、关闭重启、图片恢复、快速切换、连续回车防重复，以及发行版独立 MCP 启动和实时同步均已验证。安装包约 108 MB，应用自身资源约 1.5 MB，其余主要为桌面运行时。

前端采用 React + Tiptap，桌面壳采用 Electron，MCP 采用官方 TypeScript SDK。界面不加载远程字体、图片或脚本；笔记链接由系统浏览器打开，渲染进程不暴露 Node.js。
