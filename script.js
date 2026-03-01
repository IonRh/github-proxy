(function() {
    'use strict';
    
    // 等待 DOM 完全加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
    
    function initApp() {
        console.log('初始化应用...');
        
        const resourceUrlInput = document.getElementById('resource-url');
        const proxyBtn = document.getElementById('proxy-btn');
        const resultContainer = document.getElementById('result-container');
        const proxyResultInput = document.getElementById('proxy-result');
        const copyBtn = document.getElementById('copy-btn');
        const openBtn = document.getElementById('open-btn');
        const statusMessage = document.getElementById('status-message');

        // 检查所有必需的元素
        const elements = {
            resourceUrlInput,
            proxyBtn,
            resultContainer,
            proxyResultInput,
            copyBtn,
            openBtn,
            statusMessage
        };
        
        for (const [name, element] of Object.entries(elements)) {
            if (!element) {
                console.error(\`找不到元素: \${name}\`);
                return;
            }
        }
        
        console.log('所有元素已找到，绑定事件...');

        // 显示状态消息
        function showStatus(message, type = 'info') {
            statusMessage.textContent = message;
            statusMessage.className = \`status-message \${type}\`;
            statusMessage.style.display = 'block';
            
            if (type !== 'error') {
                setTimeout(() => {
                    statusMessage.style.display = 'none';
                }, 3000);
            }
        }

        // JSDelivr 正则表达式
        const patterns = {
            jsdelivr: [
                /^(?:https?:\\/\\/)?cdn\\.jsdelivr\\.net\\/npm\\/.+$/i,
                /^(?:https?:\\/\\/)?cdn\\.jsdelivr\\.net\\/gh\\/.+$/i,
                /^(?:https?:\\/\\/)?cdn\\.jsdelivr\\.net\\/wp\\/.+$/i,
                /^(?:https?:\\/\\/)?cdn\\.jsdelivr\\.net\\/combine\\/.+$/i,
                /^(?:https?:\\/\\/)?cdn\\.jsdelivr\\.net\\/.+$/i
            ],
            github: [
                /^(?:https?:\\/\\/)?github\\.com\\/.+?\\/.+?\\/(?:releases|archive)\\/.*$/i,
                /^(?:https?:\\/\\/)?github\\.com\\/.+?\\/.+?\\/(?:blob|raw)\\/.*$/i,
                /^(?:https?:\\/\\/)?github\\.com\\/.+?\\/.+?\\/(?:info|git-).*$/i,
                /^(?:https?:\\/\\/)?github\\.com\\/.+?\\/.+?\\/tags.*$/i,
                /^(?:https?:\\/\\/)?api\\.github\\.com\\/.*$/i
            ],
            rawgithub: [
                /^(?:https?:\\/\\/)?raw\\.(?:githubusercontent|github)\\.com\\/.+?\\/.+?\\/.+?\\/.+$/i,
                /^(?:https?:\\/\\/)?gist\\.(?:githubusercontent|github)\\.com\\/.+?\\/.+?\\/.+$/i
            ],
            docker: [
                /^(?:https?:\\/\\/)?registry-1\\.docker\\.io\\/.+$/i
            ]
        };

        function checkUrl(url) {
            console.log('检查URL:', url);
            
            for (const [type, regexArray] of Object.entries(patterns)) {
                for (const regex of regexArray) {
                    if (regex.test(url)) {
                        console.log(\`匹配类型: \${type}\`);
                        return type;
                    }
                }
            }
            
            console.log('未匹配任何类型');
            return null;
        }

        function generateProxyUrl(url) {
            console.log('生成代理URL:', url);
            
            url = url.trim();
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            try {
                const urlObj = new URL(url);
                const pathAndQuery = urlObj.pathname + urlObj.search;
                const currentHost = window.location.host;
                const protocol = window.location.protocol;
                
                const urlType = checkUrl(url);
                let prefix = '';
                
                switch (urlType) {
                    case 'jsdelivr':
                        prefix = '';
                        break;
                    case 'github':
                        prefix = '/github';
                        break;
                    case 'rawgithub':
                        prefix = '/rawgithub';
                        break;
                    case 'docker':
                        prefix = '/docker';
                        break;
                    default:
                        throw new Error('不支持的URL类型');
                }

                const proxyUrl = protocol + '//' + currentHost +'/'+url;
                console.log('生成的代理URL:', proxyUrl);
                return proxyUrl;
                
            } catch (error) {
                console.error('URL生成错误:', error);
                throw error;
            }
        }

        // 按钮点击事件
        proxyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('按钮被点击');
            
            const url = resourceUrlInput.value.trim();
            console.log('输入的URL:', url);
            
            if (!url) {
                showStatus('请输入链接！', 'error');
                return;
            }
            
            // 禁用按钮防止重复点击
            proxyBtn.disabled = true;
            proxyBtn.textContent = '处理中...';
            showStatus('正在生成代理链接...', 'info');
            
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
                console.error('生成代理URL失败:', error);
                showStatus(error.message, 'error');
            } finally {
                // 恢复按钮状态
                proxyBtn.disabled = false;
                proxyBtn.textContent = '获取链接';
            }
        });

        // 复制按钮事件
        copyBtn.addEventListener('click', function() {
            console.log('复制按钮被点击');
            
            proxyResultInput.select();
            proxyResultInput.setSelectionRange(0, 99999); // 移动端兼容
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showStatus('链接已复制到剪贴板！', 'success');
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '已复制';
                    copyBtn.disabled = true;
                    
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.disabled = false;
                    }, 2000);
                } else {
                    throw new Error('复制失败');
                }
            } catch (error) {
                console.error('复制失败:', error);
                showStatus('复制失败，请手动复制！', 'error');
            }
        });

        // 访问按钮事件
        openBtn.addEventListener('click', function() {
            console.log('访问按钮被点击');
            
            const proxyUrl = proxyResultInput.value;
            if (proxyUrl) {
                window.open(proxyUrl, '_blank');
                showStatus('正在新窗口中打开链接...', 'info');
            }
        });

        // 回车键事件
        resourceUrlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                proxyBtn.click();
            }
        });

        // 自动聚焦输入框
        resourceUrlInput.focus();
        console.log('应用初始化完成');
    }
})();
