document.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素
    const githubUrlInput = document.getElementById('github-url');
    const proxyBtn = document.getElementById('proxy-btn');
    const resultContainer = document.getElementById('result-container');
    const proxyResultInput = document.getElementById('proxy-result');
    const copyBtn = document.getElementById('copy-btn');
    const openBtn = document.getElementById('open-btn');
    
    // 定义正则表达式，与worker.js中的保持一致
    const exp1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i;
    const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i;
    const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i;
    const exp4 = /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i;
    const exp5 = /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i;
    const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i;
    const exp7 = /^(?:https?:\/\/)?api\.github\.com\/.*$/i;
    
    // 当前页面URL的前缀，用于构建代理URL
    const PREFIX = '/';
    
    // 检查URL是否符合GitHub资源格式
    function checkUrl(url) {
        for (let exp of [exp1, exp2, exp3, exp4, exp5, exp6, exp7]) {
            if (url.search(exp) === 0) {
                return true;
            }
        }
        return false;
    }
    
    // 生成代理URL
    function generateProxyUrl(url) {
        // 清理URL，确保格式一致
        url = url.trim();
        
        // 去除URL前的http或https
        url = url.replace(/^https?:\/\//, '');
        
        // 获取当前页面的主机名
        const currentHost = window.location.host;
        const protocol = window.location.protocol;
        
        // 构建最终的代理URL
        return `${protocol}//${currentHost}${PREFIX}${url}`;
    }
    
    // 处理代理按钮点击事件
    proxyBtn.addEventListener('click', () => {
        const url = githubUrlInput.value.trim();
        
        if (!url) {
            alert('请输入GitHub链接！');
            return;
        }
        
        if (!checkUrl(url)) {
            alert('不支持的链接格式！请输入正确的GitHub资源链接。');
            return;
        }
        
        const proxyUrl = generateProxyUrl(url);
        
        // 显示结果
        proxyResultInput.value = proxyUrl;
        resultContainer.classList.remove('hidden');
    });
    
    // 复制代理链接
    copyBtn.addEventListener('click', () => {
        proxyResultInput.select();
        document.execCommand('copy');
        
        // 显示复制成功提示
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '已复制';
        copyBtn.disabled = true;
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.disabled = false;
        }, 2000);
    });
    
    // 打开代理链接
    openBtn.addEventListener('click', () => {
        const proxyUrl = proxyResultInput.value;
        if (proxyUrl) {
            window.open(proxyUrl, '_blank');
        }
    });
    
    // 添加输入框回车事件
    githubUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            proxyBtn.click();
        }
    });
    
    // 自动聚焦输入框
    githubUrlInput.focus();
}); 
