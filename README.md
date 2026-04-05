# AIPLOT.FUN

正式产品化的角色蒸馏与长期关系聊天系统。

当前版本已移除所有 demo 角色和 demo 入口，只保留两类角色：

- 公共角色：由 `SUPER_ADMIN` 创建和维护，所有登录用户可使用。
- 我的角色：由普通用户创建，仅创建者本人可见、可编辑、可删除。

## 技术栈

- Next.js 16.2.2
- React 19
- Prisma 7 + PostgreSQL
- Auth.js Credentials
- Vercel Blob
- Vercel AI SDK
- BLTCY gateway

## 当前能力

- 用户名 + 密码注册登录
- `SUPER_ADMIN` / `USER` 两级权限
- 公共角色 / 私有角色隔离
- 角色蒸馏、版本管理、角色聊天
- 每个 `(userId, characterId)` 维度的长期记忆
- 管理后台：用户、配额、调用统计、公共角色管理
- 蒸馏模型固定为 `gpt-5.4`
- 创建任务后台执行，状态可恢复

## 环境变量

复制 `.env.example` 到 `.env.local`：

```bash
NEXT_PUBLIC_APP_URL=https://aiplot.fun
AUTH_SECRET=
AUTH_TRUST_HOST=true

BLTCY_BASE_URL=https://api.bltcy.ai
BLTCY_API_KEY=
QWEN_TTS_API_KEY=
QWEN_TTS_URL=https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
QWEN_TTS_MODEL=qwen3-tts-instruct-flash

DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=

ELEVENLABS_API_KEY=
OPENAI_API_KEY=

INITIAL_SUPER_ADMIN_USERNAME=
INITIAL_SUPER_ADMIN_PASSWORD=

DEFAULT_DISTILLATION_QUOTA=3
DEFAULT_CHAT_QUOTA=500
DEFAULT_TTS_QUOTA=20
```

## 本地启动

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

## 超级管理员初始化

可通过两种方式初始化第一个管理员：

1. 在 `.env.local` 中设置：

```bash
INITIAL_SUPER_ADMIN_USERNAME=admin
INITIAL_SUPER_ADMIN_PASSWORD=strong-password
```

然后执行：

```bash
npm run seed
```

2. 或单独执行：

```bash
npm run init-admin
```

规则：

- 如果数据库里已存在 `SUPER_ADMIN`，脚本会跳过。
- 仓库中不保存管理员明文密码。
- 管理员密码始终以哈希形式存储。

## 公共角色和私有角色

- 普通用户创建角色时，后端强制保存为 `PRIVATE`。
- 管理员创建角色时，后端自动保存为 `PUBLIC`。
- 未登录用户可浏览首页、公共角色列表和公共角色详情。
- 创建角色、聊天、TTS、个人中心、后台页面都要求登录。

## 记忆系统

记忆严格按 `(userId, characterId)` 隔离，不跨用户、不跨角色串数据。

### 短期记忆

- 聊天页默认恢复当前用户与当前角色的活跃会话。
- Prompt 注入最近若干轮历史消息，保证上下文连续。

### 长期记忆

- 每轮对话完成后，系统从“用户消息 + 角色回复”中提取高价值信息。
- 当前支持的记忆类型：
  - `FACT`
  - `PREFERENCE`
  - `RELATIONSHIP`
  - `EXPERIENCE`
  - `TASK`
- 记忆持久化写入 `Memory` 表。

### 摘要记忆

- 系统维护 `MemorySummary`，保存：
  - 用户画像摘要
  - 关系摘要
  - 共同经历摘要
- 聊天时优先注入摘要，而不是无限拼接全部历史消息。

### 可检索记忆

- 若 embedding 可用，会把记忆向量写入 `MemoryEmbedding`。
- 每次聊天前，从当前 `(userId, characterId)` 范围内做相似度检索。
- 若 embedding 不可用，退化为持久化 lexical 检索，但作用域仍严格隔离。

## 配额规则

- `distillationQuota`：角色蒸馏真正开始时扣减。
- `chatQuota`：每次发送聊天消息时由后端校验并扣减。
- `SUPER_ADMIN` 默认无限额。
- 当前普通用户默认对话额度为 `500`。

## 管理后台

后台入口：

- `/admin`
- `/admin/users`
- `/admin/quotas`
- `/admin/usage`
- `/admin/characters`

管理员可以：

- 查看所有用户
- 启用 / 禁用账号
- 修改默认配额
- 按用户名或昵称筛选特定账号并提额
- 查看蒸馏 / 聊天 / TTS 调用统计
- 创建、编辑、删除公共角色

## 隐私与 GitHub 上传建议

如果要上传到 GitHub，建议只上传“公开版代码仓库”，不要上传以下内容：

- `.env*`
- `.vercel/`
- `.npm-cache/`
- `.tmp*`
- 本地日志
- 任何数据库连接串、API Key、管理员初始化密码

当前 `.gitignore` 已排除这些敏感文件。

进一步建议：

- 所有密钥只放在部署平台环境变量中
- 所有密码只保存哈希，不保存明文
- 管理员初始化只通过环境变量或单独脚本完成
- 生产数据库、Blob、Vercel 项目配置不进入仓库

## 说明

- 所有 demo 内容已删除。
- 不再提供路飞、孔子、韩立或任何预置名人 / 动漫角色。
- 公共角色必须由管理员正式创建。
- 私有角色和对应聊天记忆默认只对所有者本人可见。
