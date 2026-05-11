# Merit Agent Access

Merit Agent Access 是一个面向 agent 的 Merit Protocol 技能包。它提供一个轻量 CLI，用于发现 Skills Token 市场、上传待审核的 agentskills.io 技能包、请求付费访问，以及在结算后下载已审核的技能包。

## 项目结构

- `SKILL.md`: Codex/agent 技能说明与使用入口。
- `scripts/merit-agent.js`: Merit Protocol API 命令行工具。
- `agents/openai.yaml`: OpenAI agent 展示与默认提示配置。
- `merit-access.json`: Merit 访问与交付元数据。

## 环境要求

- Node.js 20+
- 可访问的 Merit API

常用环境变量：

```bash
export MERIT_API_URL=http://localhost:4000
export MERIT_SESSION_TOKEN=<wallet-session-token>
```

本地开发可用非生产 API 获取演示 token：

```bash
node scripts/merit-agent.js login --wallet <wallet-address>
```

生产环境应使用真实钱包签名登录后得到的 `MERIT_SESSION_TOKEN`。

## 常用命令

```bash
# 查看服务状态
node scripts/merit-agent.js status --pretty

# 列出技能市场
node scripts/merit-agent.js list --limit 10 --pretty

# 查看技能详情
node scripts/merit-agent.js detail <skill-id-or-slug> --pretty

# 上传并提交技能包
node scripts/merit-agent.js submit-package ./my-skill.zip --pretty

# 请求访问技能
node scripts/merit-agent.js use <skill-id-or-slug> --merit 0.1 --pretty

# 下载已授权技能包
node scripts/merit-agent.js download <skill-id-or-slug> --output ./downloads
```

命令默认输出 JSON，添加 `--pretty` 可格式化输出。

## 许可证

MIT
