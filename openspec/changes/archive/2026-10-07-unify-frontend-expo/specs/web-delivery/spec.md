# Spec Delta

## Purpose

统一 Web 交付 —— 一份前端构建产物同时承载玩家端与管理后台，由单一进程对外服务，代理 API 与 WebSocket，并保持登录会话跨刷新存活。

## ADDED Requirements

### Requirement: 单源双端交付

系统 SHALL 用同一份前端 Web 构建产物同时服务玩家端（根路径）与管理后台（`/admin` 路径）；未匹配的静态路径 SHALL 回退到应用入口（SPA fallback）。

#### Scenario: 直达后台深层链接
- **WHEN** 浏览器直接打开 `/admin/history`（非首页入口）
- **THEN** 应用正常加载并渲染对应后台页面，而非 404

### Requirement: API 反向代理

Web 交付服务 MUST 将 `/api/*` 请求反向代理到后端 API 服务；代理目标 MUST 可通过环境变量配置（默认本机 API 端口）。

#### Scenario: 页面请求后端数据
- **WHEN** 前端页面发起 `/api/matches?status=open` 请求
- **THEN** 该请求被代理到后端 API 并原样返回结果

### Requirement: WebSocket 反向代理

Web 交付服务 MUST 将 `/ws/*` 的 WebSocket 升级请求代理到后端 API 服务，使浏览器端的实时赔率通道在同源下可用。

#### Scenario: 大厅接收实时赔率
- **WHEN** 管理员调整赔率后，后台广播一批赔率更新
- **THEN** 通过同源 WebSocket 连接的大厅页面收到更新并刷新显示

### Requirement: 登录会话跨刷新持久

用户登录后，页面刷新 MUST 保持登录状态（凭据持久化在客户端存储）；登出 MUST 清除持久化凭据并回到未登录态。

#### Scenario: 刷新保持登录
- **WHEN** 已登录用户刷新页面
- **THEN** 用户仍处于登录状态且可继续调用需鉴权的接口，无需重新登录

### Requirement: 原生构建直连 API

iOS/Android 原生构建 SHALL 不经过 Web 反向代理，使用配置的绝对 API 地址直连后端（API 侧已放行跨域）。

#### Scenario: 原生端拉取赛事
- **WHEN** 原生 App 启动并请求赛事列表
- **THEN** 请求直接发往配置的绝对 API 地址并成功返回
