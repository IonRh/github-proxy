# GitHub 资源代理

一个基于 Cloudflare Workers 的 GitHub 资源代理服务，用于解决 GitHub 资源访问速度慢的问题。

## 功能特点

- 无需依赖第三方 Web 页面
- 简洁现代的用户界面
- 支持多种 GitHub 资源链接格式
- 响应式设计，适配移动设备
- 一键复制和访问代理链接

## 支持的链接类型

- Releases 下载链接：`github.com/owner/repo/releases/download/...`
- Raw 和 Blob 文件：`github.com/owner/repo/raw/...` 或 `/blob/...`
- Archive 链接：`github.com/owner/repo/archive/...`
- Raw 文件：`raw.githubusercontent.com/owner/repo/...`
- Gist 文件：`gist.github.com/owner/...`

## 部署方法

1. 克隆本仓库到本地
   ```
   git clone https://github.com/yourusername/github-proxy.git
   ```

2. 修改 `worker.js` 中的配置（如需要）
   - `PREFIX`：自定义路由前缀
   - `Config.jsdelivr`：是否使用 jsDelivr 镜像（0 为关闭）

3. 将静态文件（`index.html`, `style.css`, `script.js`, `favicon.svg`）上传到您的 Web 服务器或 GitHub Pages

4. 在 Cloudflare Workers 上部署 `worker.js`

5. 配置域名（如需要）指向您的 Cloudflare Workers

## 使用方法

1. 访问部署好的网站
2. 在输入框中粘贴 GitHub 资源链接
3. 点击"代理访问"按钮
4. 复制生成的代理链接或直接点击"访问"按钮

## 技术栈

- 前端：HTML, CSS, JavaScript
- 后端：Cloudflare Workers

## 注意事项

- 本工具仅用于学习研究，请遵守相关法律法规
- 不存储任何用户数据
- 如有任何问题或建议，请提交 Issue

## 许可证

MIT License 