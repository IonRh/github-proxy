(function() {
    'use strict';
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
    
    function initApp() {
        const resourceUrlInput = document.getElementById('resource-url');
        const proxyBtn = document.getElementById('proxy-btn');
        const resultContainer = document.getElementById('result-container');
        const proxyResultInput = document.getElementById('proxy-result');
        const copyBtn = document.getElementById('copy-btn');
        const openBtn = document.getElementById('open-btn');
        const statusMessage = document.getElementById('status-message');
        const dockerResultContainer = document.getElementById('docker-result-container');

        const requiredElements = { resourceUrlInput, proxyBtn, resultContainer, proxyResultInput, copyBtn, openBtn, statusMessage };
        for (const [name, el] of Object.entries(requiredElements)) {
            if (!el) { console.error(`找不到元素: ${name}`); return; }
        }

        let statusTimer = null;

        function showStatus(message, type = 'info') {
            if (statusTimer) clearTimeout(statusTimer);
            statusMessage.textContent = message;
            statusMessage.className = `status-message ${type}`;
            statusMessage.style.display = 'block';
            
            if (type !== 'error') {
                statusTimer = setTimeout(() => {
                    statusMessage.style.display = 'none';
                    statusTimer = null;
                }, 3000);
            }
        }

        // URL 匹配模式
        const patterns = {
            jsdelivr: [
                /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/npm\/.+$/i,
                /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/gh\/.+$/i,
                /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/wp\/.+$/i,
                /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/combine\/.+$/i,
                /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/.+$/i
            ],
            github: [
                /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i,
                /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i,
                /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i,
                /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i,
                /^(?:https?:\/\/)?api\.github\.com\/.*$/i
            ],
            rawgithub: [
                /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i,
                /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i
            ],
            docker: [
                /^(?:https?:\/\/)?registry-1\.docker\.io\/.+$/i
            ]
        };

        function checkUrl(url) {
            for (const [type, regexArray] of Object.entries(patterns)) {
                for (const regex of regexArray) {
                    if (regex.test(url)) return type;
                }
            }
            return null;
        }

        // Docker 镜像名识别
        // 匹配: nginx, nginx:latest, ubuntu:22.04, user/repo, user/repo:tag
        // 不匹配: 包含协议、域名点号的 URL
        const dockerImagePattern = /^(?!https?:\/\/)([a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)?)(?::([a-zA-Z0-9][a-zA-Z0-9._-]*))?$/;

        function parseDockerImage(input) {
            const match = input.trim().match(dockerImagePattern);
            if (!match) return null;

            let name = match[1];
            let tag = match[2] || 'latest';

            // 排除看起来像域名的输入（含有 .）
            // 但允许像 "user/repo" 的格式
            if (name.includes('.')) return null;

            // 官方镜像补全 library/ 前缀
            if (!name.includes('/')) {
                name = 'library/' + name;
            }

            return { name, tag, original: match[1] + ':' + tag };
        }

        function generateProxyUrl(url) {
            url = url.trim();
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            // 验证是合法 URL
            new URL(url);

            const { protocol, host } = window.location;
            return `${protocol}//${host}/${url}`;
        }

        // 获取链接
        proxyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const url = resourceUrlInput.value.trim();
            
            if (!url) {
                showStatus('请输入链接！', 'error');
                return;
            }
            
            proxyBtn.disabled = true;
            const btnSpan = proxyBtn.querySelector('span');
            const originalText = btnSpan.textContent;
            btnSpan.textContent = '处理中...';
            
            try {
                // 先检查是否为 Docker 镜像名（如 nginx、ubuntu:22.04）
                const dockerImage = parseDockerImage(url);
                if (dockerImage) {
                    showDockerResult(dockerImage);
                    showStatus('已识别为 Docker 镜像！', 'success');
                    return;
                }

                const urlType = checkUrl(url);
                if (!urlType) {
                    throw new Error('不支持的链接格式！请输入 JSDelivr、GitHub、Docker 链接或 Docker 镜像名（如 nginx:latest）。');
                }
                
                // Docker registry URL 也走 Docker 结果面板
                if (urlType === 'docker') {
                    const dockerFromUrl = parseDockerRegistryUrl(url);
                    if (dockerFromUrl) {
                        showDockerResult(dockerFromUrl);
                        showStatus('已识别为 Docker 镜像！', 'success');
                        return;
                    }
                }

                const proxyUrl = generateProxyUrl(url);
                proxyResultInput.value = proxyUrl;
                resultContainer.classList.remove('hidden');
                if (dockerResultContainer) dockerResultContainer.classList.add('hidden');
                showStatus('代理链接生成成功！', 'success');
            } catch (error) {
                showStatus(error.message, 'error');
            } finally {
                proxyBtn.disabled = false;
                btnSpan.textContent = originalText;
            }
        });

        /**
         * 从 registry-1.docker.io URL 中解析镜像信息
         */
        function parseDockerRegistryUrl(url) {
            const match = url.match(/registry-1\.docker\.io\/v2\/(.+?)\/manifests\/(.+)/i) 
                       || url.match(/registry-1\.docker\.io\/(.+?)(?::(.+))?$/i);
            if (!match) return null;
            const name = match[1];
            const tag = match[2] || 'latest';
            const shortName = name.startsWith('library/') ? name.replace('library/', '') : name;
            return { name, tag, original: shortName + ':' + tag };
        }

        /**
         * 显示 Docker 镜像拉取结果面板
         */
        function showDockerResult(image) {
            if (!dockerResultContainer) return;

            const { protocol, host } = window.location;
            const proxyDomain = host;
            const shortName = image.name.startsWith('library/') 
                ? image.name.replace('library/', '') 
                : image.name;

            // 方式一：配置 registry-mirrors 后直接拉取
            const mirrorCmd = `docker pull ${shortName}:${image.tag}`;
            const mirrorEl = document.getElementById('docker-cmd-mirror');
            if (mirrorEl) mirrorEl.textContent = mirrorCmd;

            // 方式二：指定代理域名拉取
            const proxyCmd = `docker pull ${proxyDomain}/${image.name}:${image.tag}`;
            const proxyEl = document.getElementById('docker-cmd-proxy');
            if (proxyEl) proxyEl.textContent = proxyCmd;

            // 重新打标签提示
            const retagEl = document.getElementById('docker-retag-hint');
            if (retagEl) {
                retagEl.textContent = `docker tag ${proxyDomain}/${image.name}:${image.tag} ${shortName}:${image.tag}`;
            }

            // 显示 Docker 面板，隐藏普通结果
            resultContainer.classList.add('hidden');
            dockerResultContainer.classList.remove('hidden');

            // 重新绑定新生成的代码块复制按钮
            dockerResultContainer.querySelectorAll('.code-copy-btn').forEach(btn => {
                btn.onclick = async function() {
                    const targetId = this.getAttribute('data-target');
                    const codeEl = document.getElementById(targetId);
                    if (!codeEl) return;
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(codeEl.textContent);
                        } else {
                            const ta = document.createElement('textarea');
                            ta.value = codeEl.textContent;
                            ta.style.cssText = 'position:fixed;opacity:0';
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                        }
                        const icon = this.querySelector('i');
                        if (icon) {
                            icon.className = 'ri-check-line';
                            setTimeout(() => { icon.className = 'ri-file-copy-line'; }, 1500);
                        }
                    } catch {}
                };
            });
        }

        // 复制（优先使用 Clipboard API）
        copyBtn.addEventListener('click', async function() {
            const text = proxyResultInput.value;
            if (!text) return;

            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    proxyResultInput.select();
                    proxyResultInput.setSelectionRange(0, 99999);
                    document.execCommand('copy');
                }

                showStatus('链接已复制到剪贴板！', 'success');
                const btnSpan = copyBtn.querySelector('span');
                const originalText = btnSpan.textContent;
                btnSpan.textContent = '已复制';
                copyBtn.disabled = true;

                setTimeout(() => {
                    btnSpan.textContent = originalText;
                    copyBtn.disabled = false;
                }, 2000);
            } catch {
                showStatus('复制失败，请手动复制！', 'error');
            }
        });

        // 新窗口打开
        openBtn.addEventListener('click', function() {
            const proxyUrl = proxyResultInput.value;
            if (proxyUrl) {
                window.open(proxyUrl, '_blank', 'noopener,noreferrer');
            }
        });

        // 回车提交
        resourceUrlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                proxyBtn.click();
            }
        });

        resourceUrlInput.focus();

        // 代码块复制按钮
        document.querySelectorAll('.code-copy-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const targetId = this.getAttribute('data-target');
                const codeEl = document.getElementById(targetId);
                if (!codeEl) return;

                const text = codeEl.textContent;
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        const textarea = document.createElement('textarea');
                        textarea.value = text;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                    }
                    
                    const icon = this.querySelector('i');
                    if (icon) {
                        icon.className = 'ri-check-line';
                        setTimeout(() => { icon.className = 'ri-file-copy-line'; }, 1500);
                    }
                } catch {
                    // 静默失败
                }
            });
        });
    }
})();
