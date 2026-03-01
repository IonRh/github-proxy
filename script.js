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
                const urlType = checkUrl(url);
                if (!urlType) {
                    throw new Error('不支持的链接格式！请输入正确的 JSDelivr、GitHub 或 Docker 资源链接。');
                }
                
                const proxyUrl = generateProxyUrl(url);
                proxyResultInput.value = proxyUrl;
                resultContainer.classList.remove('hidden');
                showStatus('代理链接生成成功！', 'success');
            } catch (error) {
                showStatus(error.message, 'error');
            } finally {
                proxyBtn.disabled = false;
                btnSpan.textContent = originalText;
            }
        });

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
    }
})();
