'use strict'

/**
 * 资源加速器 - Cloudflare Worker
 * 支持 GitHub、JSDelivr、Docker 资源代理
 */

const ASSET_URL = 'https://ionrh.github.io/github-proxy/'
const PREFIX = '/'

const Config = {
    jsdelivr: 0  // 分支文件使用 jsDelivr 镜像的开关，0 为关闭
}

const whiteList = [] // 白名单，路径中包含指定字符才放行，e.g. ['/username/']

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

// 需要直接透传的模式（GitHub 相关）
const PROXY_PATTERNS = [
    PATTERNS.releases, PATTERNS.gitInfo, PATTERNS.raw,
    PATTERNS.gist, PATTERNS.tags, PATTERNS.api,
]

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

    // Docker 代理
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
    // 移除可能导致问题的请求头
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

