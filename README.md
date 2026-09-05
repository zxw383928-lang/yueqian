# 跃迁

一款为高中生日常学习设计的本地优先任务与专注工具。打开即可使用，不需要账号，数据默认保存在当前设备中。

## 能做什么

- 用“今日三件事”降低开始任务的难度
- 添加、完成、筛选和删除学习任务
- 使用 25 / 45 / 60 分钟专注计时器
- 自动记录专注分钟、连续天数和成长值
- 查看最近 7 天的节奏与里程碑
- 导出或导入 JSON 数据备份
- 安装到 Android 或桌面，断网后继续使用
- 在深色、浅色与跟随系统模式间切换

## 本地运行

这是一个零依赖静态项目。不要直接双击 `index.html`，请在项目目录启动任意静态文件服务器：

```bash
python -m http.server 8080 --directory dist
```

然后访问 `http://localhost:8080`。

在 Termux 中也可以使用同一条命令，并通过手机浏览器打开显示的地址。

提交代码前可以运行项目自带的静态检查：

```bash
node scripts/validate.mjs
node --check dist/app.js
node --check dist/sw.js
```

## 项目结构

```text
dist/
├── index.html            页面结构
├── styles.css            响应式视觉样式
├── app.js                任务、计时与统计逻辑
├── sw.js                 离线缓存
├── manifest.webmanifest  PWA 安装配置
└── assets/               应用图标
```

## 数据与隐私

任务和专注记录保存在浏览器的 `localStorage` 中，不会自动上传。清除浏览器数据前，请先在“设置 → 数据备份”中导出 JSON 文件。

## 后续可扩展方向

1. 用 IndexedDB 支持更大量的记录与学习笔记
2. 增加考试倒计时和按学科统计
3. 接入可选的 AI 任务拆解，但继续保留无账号离线模式
4. 封装为 Android 应用并添加系统级专注通知

## 许可

MIT
