'use strict'

/**
 * 资源加速器 - Cloudflare Worker
 * 支持 GitHub、JSDelivr、Docker Registry 镜像代理
 */

const ASSET_URL = 'https://ionrh.github.io/github-proxy/'
const PREFIX = '/'

const Config = {
    jsdelivr: 0  // 分支文件使用 jsDelivr 镜像的开关，0 为关闭
}

const whiteList = [] // 白名单，路径中包含指定字符才放行，e.g. ['/username/']

// Docker Hub 配置
const DOCKER_HUB = 'https://registry-1.docker.io'
const DOCKER_AUTH = 'https://auth.docker.io'

/** @type {ResponseInit} */
const PREFLIGHT_INIT = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-allow-headers': '*',
        'access-control-max-age': '1728000',
    }),
}

// ---- URL 匹配正则 ----
const PATTERNS = {
    // GitHub
    releases:   /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i,
    blob:       /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i,
    gitInfo:    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i,
    raw:        /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i,
    gist:       /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i,
    tags:       /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i,
    api:        /^(?:https?:\/\/)?api\.github\.com\/.*$/i,
    // JSDelivr
    jsdelivrNpm:     /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/npm\/.+$/i,
    jsdelivrGh:      /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/gh\/.+$/i,
    jsdelivrWp:      /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/wp\/.+$/i,
    jsdelivrCombine: /^(?:https?:\/\/)?cdn\.jsdelivr\.net\/combine\/.+$/i,
    // Docker
    docker:     /^(?:https?:\/\/)?registry-1\.docker\.io\/.+$/i,
}

// 所有已知模式（用于重定向 location 判断）
const ALL_PATTERNS = Object.values(PATTERNS)

/**
 * 创建带 CORS 头的响应
 */
function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*'
    return new Response(body, { status, headers })
}

/**
 * 安全解析 URL
 */
function newUrl(urlStr) {
    try {
        return new URL(urlStr)
    } catch {
        return null
    }
}

/**
 * 检查 URL 是否匹配任一已知模式
 */
function checkUrl(u) {
    return ALL_PATTERNS.some(pattern => pattern.test(u))
}

/**
 * 检查 URL 匹配的类型
 */
function matchPattern(path) {
    for (const [name, pattern] of Object.entries(PATTERNS)) {
        if (pattern.test(path)) return name
    }
    return null
}

/**
 * 确保 URL 有 https:// 前缀
 */
function ensureHttps(url) {
    if (/^(?:https?:\/\/)/.test(url)) return url
    return 'https://' + url
}

addEventListener('fetch', e => {
    const ret = fetchHandler(e)
        .catch(err => makeRes('cfworker error:\n' + err.stack, 502))
    e.respondWith(ret)
})

/**
 * 主请求处理
 * @param {FetchEvent} e
 */
async function fetchHandler(e) {
    const req = e.request
    const urlObj = new URL(req.url)
    const pathname = urlObj.pathname

    // ---- Docker Registry V2 镜像代理 ----
    // 匹配 /v2/ 开头的路径，作为 Docker Registry Mirror
    if (pathname === '/v2/' || pathname === '/v2') {
        return dockerV2Handler(req, urlObj)
    }
    if (pathname.startsWith('/v2/')) {
        return dockerV2ProxyHandler(req, urlObj)
    }

    // ?q= 参数快捷跳转
    const qParam = urlObj.searchParams.get('q')
    if (qParam) {
        return Response.redirect('https://' + urlObj.host + PREFIX + qParam, 301)
    }

    // 提取目标路径（Cloudflare 会合并 //，需要还原）
    let path = urlObj.href.substring(urlObj.origin.length + PREFIX.length)
        .replace(/^https?:\/+/, 'https://')

    const type = matchPattern(path)

    if (!type) {
        // 未匹配任何模式，返回静态资源（首页等）
        return fetch(ASSET_URL + path)
    }

    // JSDelivr 代理
    if (type.startsWith('jsdelivr')) {
        return httpHandler(req, ensureHttps(path))
    }

    // Docker 代理（直接拼接 URL 方式）
    if (type === 'docker') {
        return httpHandler(req, ensureHttps(path))
    }

    // GitHub blob → raw 转换或 jsDelivr 重定向
    if (type === 'blob') {
        if (Config.jsdelivr) {
            const redirectUrl = path
                .replace('/blob/', '@')
                .replace(/^(?:https?:\/\/)?github\.com/, 'https://cdn.jsdelivr.net/gh')
            return Response.redirect(redirectUrl, 302)
        }
        path = path.replace('/blob/', '/raw/')
        return httpHandler(req, ensureHttps(path))
    }

    // 其余 GitHub 模式直接代理
    return httpHandler(req, ensureHttps(path))
}

// ===============================================
// Docker Registry V2 镜像代理
// ===============================================

/**
 * 处理 /v2/ 根路径 - Docker 版本检查
 * Docker daemon 首先请求 /v2/ 来确认 registry 是否支持 V2 API
 */
async function dockerV2Handler(req, urlObj) {
    const headers = new Headers({
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    })

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers })
    }

    // 向 Docker Hub 发送 /v2/ 检查请求
    const resp = await fetch(DOCKER_HUB + '/v2/', {
        method: 'GET',
        redirect: 'follow',
    })

    if (resp.status === 401) {
        // Docker Hub 返回 401，需要改写 Www-Authenticate 头
        // 将 auth.docker.io 的认证地址替换为我们的代理地址
        const wwwAuth = resp.headers.get('www-authenticate') || ''
        const newAuth = rewriteDockerAuth(wwwAuth, urlObj)
        headers.set('www-authenticate', newAuth)
        return new Response(resp.body, { status: 401, headers })
    }

    return new Response(resp.body, { status: resp.status, headers })
}

/**
 * 处理 /v2/* 的具体请求
 * 包括：manifests、blobs、tags/list 等
 */
async function dockerV2ProxyHandler(req, urlObj) {
    const pathname = urlObj.pathname

    // 处理 token 请求：/v2/auth/token?...
    // Docker daemon 会根据改写后的 Www-Authenticate 来请求 token
    if (pathname.startsWith('/v2/auth/')) {
        return dockerAuthProxy(req, urlObj)
    }

    // 代理到 Docker Hub
    const targetUrl = DOCKER_HUB + pathname + urlObj.search

    const headers = new Headers(req.headers)
    headers.delete('host')

    const resp = await fetch(targetUrl, {
        method: req.method,
        headers,
        redirect: 'follow',
        body: req.body,
    })

    const respHeaders = new Headers(resp.headers)
    respHeaders.set('access-control-allow-origin', '*')
    respHeaders.set('access-control-expose-headers', '*')

    // 如果返回 401，改写认证地址
    if (resp.status === 401) {
        const wwwAuth = respHeaders.get('www-authenticate') || ''
        respHeaders.set('www-authenticate', rewriteDockerAuth(wwwAuth, urlObj))
    }

    // 改写 blob 重定向的 Location（Docker Hub blob 经常 302 到 CDN）
    if (resp.status === 301 || resp.status === 302 || resp.status === 307) {
        const location = respHeaders.get('location')
        if (location) {
            // blob 重定向直接跟随，不需要代理
            return fetch(location, {
                method: req.method,
                headers: { 'accept': req.headers.get('accept') || '*/*' },
                redirect: 'follow',
            })
        }
    }

    return new Response(resp.body, {
        status: resp.status,
        headers: respHeaders,
    })
}

/**
 * 代理 Docker 认证请求
 * Docker daemon 需要先获取 token 才能拉取镜像
 */
async function dockerAuthProxy(req, urlObj) {
    // 将 /v2/auth/token?... 转换为 auth.docker.io/token?...
    const search = urlObj.search
    const targetUrl = DOCKER_AUTH + '/token' + search

    const resp = await fetch(targetUrl, {
        method: req.method,
        headers: {
            'accept': 'application/json',
        },
        redirect: 'follow',
    })

    const headers = new Headers(resp.headers)
    headers.set('access-control-allow-origin', '*')
    headers.set('access-control-expose-headers', '*')

    return new Response(resp.body, {
        status: resp.status,
        headers,
    })
}

/**
 * 改写 Docker Www-Authenticate 头
 * 将 realm="https://auth.docker.io/token" 替换为我们的代理地址
 */
function rewriteDockerAuth(wwwAuth, urlObj) {
    // 原始: Bearer realm="https://auth.docker.io/token",service="registry.docker.io"
    // 目标: Bearer realm="https://your-worker.com/v2/auth/token",service="registry.docker.io"
    const proxyOrigin = urlObj.origin
    return wwwAuth.replace(
        /https?:\/\/auth\.docker\.io\/token/gi,
        proxyOrigin + '/v2/auth/token'
    )
}

// ===============================================
// 通用 HTTP 代理
// ===============================================

/**
 * HTTP 请求处理（白名单校验 + 代理）
 * @param {Request} req
 * @param {string} pathname 完整目标 URL
 */
function httpHandler(req, pathname) {
    // CORS 预检
    if (req.method === 'OPTIONS' && req.headers.has('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT)
    }

    // 白名单校验
    if (whiteList.length > 0) {
        const allowed = whiteList.some(item => pathname.includes(item))
        if (!allowed) {
            return new Response('blocked', { status: 403 })
        }
    }

    const reqHdrNew = new Headers(req.headers)
    reqHdrNew.delete('host')

    const urlObj = newUrl(pathname)
    if (!urlObj) {
        return makeRes('Invalid URL: ' + pathname, 400)
    }

    /** @type {RequestInit} */
    const reqInit = {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'manual',
        body: req.body
    }
    return proxy(urlObj, reqInit)
}

/**
 * 代理请求并处理重定向
 * @param {URL} urlObj
 * @param {RequestInit} reqInit
 * @param {number} depth 递归深度限制
 */
async function proxy(urlObj, reqInit, depth = 0) {
    if (depth > 5) {
        return makeRes('Too many redirects', 502)
    }

    const res = await fetch(urlObj.href, reqInit)
    const resHdrNew = new Headers(res.headers)
    const status = res.status

    // 处理重定向
    if (resHdrNew.has('location')) {
        let location = resHdrNew.get('location')
        if (checkUrl(location)) {
            resHdrNew.set('location', PREFIX + location)
        } else {
            reqInit.redirect = 'follow'
            return proxy(newUrl(location), reqInit, depth + 1)
        }
    }

    // 设置 CORS 头
    resHdrNew.set('access-control-expose-headers', '*')
    resHdrNew.set('access-control-allow-origin', '*')

    // 移除安全策略头（避免浏览器拦截）
    resHdrNew.delete('content-security-policy')
    resHdrNew.delete('content-security-policy-report-only')
    resHdrNew.delete('clear-site-data')

    return new Response(res.body, {
        status,
        headers: resHdrNew,
    })
}

