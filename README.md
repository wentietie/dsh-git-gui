# dsh-git-gui

IDEA 风格的 Git 提交面板,作为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(DSH)的客户端插件,注入到 Web GUI 的右侧边栏:变更列表、单文件 diff、暂存/取消暂存、提交信息与最近提交历史。

## 功能

- **变更列表**:解析 `git status --porcelain=v1 -z -b`,展示分支、上游跟踪、领先/落后计数与逐文件状态徽标(M/A/D/R/U)
- **Diff 视图**:单文件的未暂存 / 已暂存双模式对比,行级着色(增/删/hunk 头)
- **暂存区操作**:勾选多个文件后批量 `git add` / `git reset`
- **提交**:多行提交信息,支持 `--amend` 追加;可勾选未暂存文件一并 add 后提交
- **历史**:最近 20 条提交(`%h %an %ad %s`,相对日期)
- **多会话**:面板按当前右侧栏挂载的会话解析其工作目录;工作目录本身不是仓库时,自动探测唯一的一级子目录仓库

## 安装

本插件以链接方式安装进当前 DSH profile(无需发布/构建):

```yml
# profile 补丁(cordis.patch.yml)
- insert:
    - id: git-gui
      name: '@local/dsh-git-gui'
```

通过 DSH 插件管理器安装时等价于 `link:D:\projects\dshplugin\dsh-git-gui`。停用/移除可在 GUI 的 设置 → 插件 中操作,或让 Agent 通过 `plugin_manager` 执行。

## 架构

插件分为两半,通过一个 HTTP 路由通信:

| 文件 | 角色 |
|---|---|
| `index.js` | **Host 侧**:向 `webServer` 注册精确路由 `POST /dsh-git-gui/api`,代客户端执行受限的 git 子命令 |
| `client.js` | **Client 侧**:注册 `conversation.view` 槽位中的 "Git" 变更标签页,渲染 IDEA 风格面板(React,无构建步骤,直接经 `window.__ModuleLoader__.load` 加载) |
| `locale/*.json` | **国际化唯一数据源**(见下文) |
| `cordis.patch.yml` | profile 补丁行 |
| `client-debug.log` | Host/Client 双向诊断日志(git 忽略) |

### API action

| action | 参数 | 说明 |
|---|---|---|
| `status` | `sessionId?` | 分支 + 变更文件列表 |
| `diff` | `path` | 单文件未暂存/已暂存 diff |
| `log` | — | 最近 20 条提交 |
| `stage` / `unstage` | `paths[]` | 批量暂存/取消暂存 |
| `commit` | `message`, `paths[]?`, `amend?` | 提交(可先自动 add) |
| `i18n` | — | 返回 `locale/*.json` 中的 `gitGui` 词典 |
| `client-report` | `payload` | 客户端诊断上报(免认证) |

### 安全设计

- 每个请求(除 `client-report`)先经 `ctx.connection.admit` 认证——与 `/api` 桥同一浏览器信任围栏;无该服务时回退为仅回环地址检查
- 所有客户端提供的路径必须通过 `safePath()` 校验(拒绝绝对路径、`..`、空字节、超长),git 调用一律 `--` 分隔
- 输出上限 4 MB、stderr 64 KB、单命令超时 20 s、路径数上限 2000

## 国际化

**本插件为纯中文界面。** [locale/zh.json](locale/zh.json) 是唯一生效的 UI 词典:

```json
{
  "meta": { "title": "…", "description": "…" },
  "gitGui": { "commit": "提交", "…": "…" }
}
```

- `meta`:插件清单展示用(DSH 插件目录约定)
- `gitGui`:面板词典。Host 侧 `i18n` action 每次调用都重新读盘,client 启动时拉取 zh 词典后挂载 UI
- **修改文案只需编辑该 JSON 并刷新页面**(Host 侧无需重启);拉取失败时面板以原始 key 降级显示,不影响功能
- 词典**不注册**进 DSH `locale` 服务,也不随 GUI 语言设置切换——无论界面语言如何,面板始终中文
- `locale/en.json` 仅作为参考翻译保留,不参与运行时;如需恢复双语,见 git 历史中 `client.js` 的 `initLocale` 实现

## 开发与调试

- 链接安装意味着**改源码即改 profile**:
  - `index.js`(Host 侧)改动需新会话/宿主重启后生效
  - `client.js`(Client 侧)改动需重新加载 client bundle——仅当从 DSH checkout 运行 `pnpm run dev:web` 时支持免刷新热替换,否则刷新 GUI 页面
- 排障先看 `client-debug.log`:`host-apply`、`auth-rejected`、`i18n-loaded/failed`、`conversation.view tab-ok/failed`、client 各阶段上报都会落盘
- 语法自检:`node --check`(ESM 文件需临时改后缀)

## 约束

- 仅支持只读检查 + 暂存 + 本地提交;不提供 push/pull/discard 等远端或破坏性操作
- 重命名/复制条目的原路径在列表中显示,但 porcelain v1 的 rename 分数等细节未解析
