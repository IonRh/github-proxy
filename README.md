# ⚡ 资源加速器

一个基于 Cloudflare Workers 的多功能资源代理加速服务，支持 GitHub、JSDelivr 和 Docker Hub 镜像加速。

## ✨ 功能特点

- 🚀 **GitHub 加速** — Releases、Raw 文件、Archive、Gist、API 等全面代理
- 📦 **JSDelivr 加速** — NPM、GitHub、WordPress 包及组合链接代理
- 🐳 **Docker 镜像加速** — 完整 Registry V2 API 代理，可作为 `registry-mirrors` 使用
- 🎨 **现代化界面** — 响应式设计，动态背景，卡片式布局
- 🔒 **隐私安全** — 不存储任何用户数据，纯中转代理

## 📋 支持的链接类型

### GitHub
| 类型 | 示例 |
|------|------|
| Releases / Archive | `github.com/user/repo/releases/download/v1.0/file` |
| Raw / Blob 文件 | `github.com/user/repo/raw/main/file` |
| Raw 文件 | `raw.githubusercontent.com/user/repo/branch/file` |
| Gist 文件 | `gist.github.com/user/id/raw/file` |
| Tags | `github.com/user/repo/tags` |
| API | `api.github.com/repos/user/repo` |

### JSDelivr
| 类型 | 示例 |
|------|------|
| NPM 包 | `cdn.jsdelivr.net/npm/package@version/file` |
| GitHub 文件 | `cdn.jsdelivr.net/gh/user/repo@version/file` |
| WordPress 插件 | `cdn.jsdelivr.net/wp/plugins/plugin/version/file` |
| 组合链接 | `cdn.jsdelivr.net/combine/npm/pkg1,npm/pkg2` |

### Docker
| 类型 | 示例 |
|------|------|
| Registry URL | `registry-1.docker.io/library/nginx:latest` |
| 镜像名 | `nginx:latest`、`ubuntu:22.04`、`user/repo:tag` |

## 🚀 部署方法

### 1. 克隆仓库

```bash
git clone https://github.com/IonRh/github-proxy.git
cd github-proxy
```

### 2. 部署静态页面

将以下文件上传到 GitHub Pages 或其他静态托管服务：

```
index.html
css/style.css
js/script.js
images/favicon.svg
images/bj.svg
```

### 3. 部署 Worker

将 `worker.js` 部署到 Cloudflare Workers：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **Create**
3. 粘贴 `worker.js` 内容并部署
4. （可选）绑定自定义域名

### 4. 配置项

在 `worker.js` 中可修改：

| 配置 | 说明 | 默认值 |
|------|------|--------|
| `ASSET_URL` | 静态页面托管地址 | GitHub Pages 地址 |
| `PREFIX` | 路由前缀 | `/` |
| `Config.jsdelivr` | blob 文件是否转 jsDelivr | `0`（关闭） |
| `whiteList` | 路径白名单 | `[]`（不限制） |

## 🐳 Docker 镜像加速配置

部署完成后，可将 Worker 域名配置为 Docker 镜像源：

```bash
# 1. 编辑 Docker 配置
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["https://你的Worker域名"]
}
EOF

# 2. 重启 Docker
sudo systemctl daemon-reload
sudo systemctl restart docker

# 3. 验证
docker info | grep -A 5 "Registry Mirrors"

# 4. 正常使用即可自动加速
docker pull nginx
```

也可以不配置，直接通过代理域名拉取：

```bash
docker pull 你的Worker域名/library/nginx:latest
```

## 🛠 技术栈

- **前端**：HTML + CSS + JavaScript（Vanilla）
- **后端**：Cloudflare Workers（Service Worker API）
- **图标**：[Remix Icon](https://remixicon.com/)

## ⚠️ 注意事项

- 本工具仅用于学习研究，请遵守相关法律法规
- 不存储任何用户数据，所有请求实时中转
- Cloudflare Workers 免费版有每日请求限额（10 万次/天）
- 如有问题或建议，欢迎提交 [Issue](https://github.com/IonRh/github-proxy/issues)

## 📄 许可证

MIT License 