/**
 * 节点入口落地查询 - 终极稳定回归版
 * 1. 探针底座：100% 还原脚本 A 朴素且稳定的取数逻辑，彻底摒弃导致全盘崩溃的连坐机制。
 * 2. 独立防线：本机、入口、落地各自独立查询，任何一个超时绝不拖累全局。
 * 3. 核心大脑：保留五维智能研判与精准中文化 UI。
 * 适用环境：Loon
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params;
        const nodeName = inputParams.node;
        // 仅做最基础的安全处理：砍掉可能的端口号，还原脚本 A 的纯粹性
        const nodeAddr = inputParams.nodeInfo.address.split(':')[0].trim();
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // ==========================================
        // 第一步：独立、安全地获取三端数据 (绝不使用会崩溃的 Promise.all)
        // ==========================================
        
        // 1. 查本机 (直连)
        let local = await safeFetch("", "DIRECT");
        
        // 2. 查入口 (直连查询节点地址)
        let entrance = await safeFetch(nodeAddr, "DIRECT");
        
        // 3. 查落地 (通过节点代理)
        let landing = await safeFetch("", nodeName);

        // ==========================================
        // 第二步：执行链路类型分析逻辑
        // ==========================================
        
        let linkResult = "⟦ ❓ 未知状态 ⟧";

        // 物理防冲突：如果落地等于本机，说明节点彻底没连上
        if (!local.error && !landing.error && local.ip === landing.ip) {
            linkResult = "⟦ ⚠️ 节点未通 / 流量直连本机 ⟧";
        } 
        // 正常分析逻辑
        else if (!landing.error) {
            linkResult = analyzeLink(entrance, landing, nodeName);
        } 
        // 彻底探测失败
        else {
            linkResult = "⟦ ❌ 落地探测失败 ⟧";
        }

        // ==========================================
        // 第三步：格式化输出与中文翻译
        // ==========================================
        
        let localStr = local.error ? `🔴 本机查询失败或超时<br>` : 
            `<b>本机:</b> ${getFlag(local.countryCode)} ${local.country} ${local.city}<br>` +
            `<b>ISP:</b> ${local.isp} (${HIP(local.ip, hideIP)})<br>`;
            
        let inStr = entrance.error ? `🟡 入口查询失败或隐藏<br>` : 
            `<b>入口:</b> ${getFlag(entrance.countryCode)} ${entrance.country} ${entrance.city}<br>` +
            `<b>ISP:</b> ${entrance.isp} (${HIP(entrance.ip, hideIP)})<br>`;

        let outStr = landing.error ? `🔴 落地节点超时或离线<br>` : 
            `<b>落地:</b> ${getFlag(landing.countryCode)} ${landing.country} ${landing.city}<br>` +
            `<b>ISP:</b> ${landing.isp}<br>` +
            `<b>ASN:</b> ${landing.asn} &nbsp;&nbsp;<b>延迟:</b> ${landing.time}ms<br>` +
            `<b>IP:</b> ${HIP(landing.ip, hideIP)}<br>`;

        let message = `<p style="text-align: center; font-family: -apple-system; font-size: large; font-weight: thin">
            <br>-------------------------------<br><br>
            ${localStr}<br>${inStr}
            -------------------<br>
            <b><font color="#467fcf">${linkResult}</font></b><br>
            -------------------<br><br>
            ${outStr}
            <br>-------------------------------<br><br>
            <b>节点</b> ➟ ${nodeName}<br>
            <b>设备</b> ➟ ${loonInfo[1]} ${loonInfo[2]||""}</p>`;

        $done({ title: scriptName, htmlMessage: message });

    } catch (e) {
        // 终极兜底，确保无论如何都有弹窗提示
        $done({ title: scriptName, htmlMessage: `<p style="text-align: center;"><br>脚本执行发生致命错误:<br>${e.message}</p>` });
    }
})();


// ==========================================
// 核心底层库：朴素、独立、绝对安全的取数引擎
// ==========================================
async function safeFetch(ip, node) {
    return new Promise((resolve) => {
        let target = ip ? `/${ip}` : "";
        let url = `http://ip-api.com/json${target}?lang=zh-CN`;
        let start = Date.now();

        $httpClient.get({ url: url, node: node === "DIRECT" ? null : node, timeout: 4000 }, (err, resp, data) => {
            if (err || resp.status !== 200) {
                // 主接口失败，启用极为简单的备用接口做最后挣扎
                fallbackFetch(target, node, start, resolve);
            } else {
                try {
                    let j = JSON.parse(data);
                    if (j.status !== "success") throw new Error("API fail");
                    resolve({
                        error: false,
                        ip: j.query,
                        country: transCountry(j.country),
                        countryCode: j.countryCode,
                        city: j.city || j.regionName || "",
                        isp: transISP(j.isp || j.org),
                        asn: j.as ? j.as.split(" ")[0] : "-",
                        time: Date.now() - start
                    });
                } catch (e) {
                    fallbackFetch(target, node, start, resolve);
                }
            }
        });
    });
}

function fallbackFetch(target, node, start, resolve) {
    $httpClient.get({ url: `https://api-ipv4.ip.sb/geoip${target}`, node: node === "DIRECT" ? null : node, timeout: 3000 }, (err, resp, data) => {
        if (err || resp.status !== 200) {
            resolve({ error: true }); // 两次都失败，安静地返回错误，绝不崩溃
        } else {
            try {
                let j = JSON.parse(data);
                resolve({
                    error: false,
                    ip: j.ip,
                    country: transCountry(j.country),
                    countryCode: j.country_code,
                    city: j.city || j.region || "",
                    isp: transISP(j.isp || j.organization),
                    asn: j.asn ? `AS${j.asn}` : "-",
                    time: Date.now() - start
                });
            } catch (e) {
                resolve({ error: true });
            }
        }
    });
}


// ==========================================
// 五维逻辑分析大脑
// ==========================================
function analyzeLink(entrance, landing, nodeName) {
    const nameU = nodeName.toUpperCase();
    const outIP = landing.ip;
    const inIP = entrance.error ? null : entrance.ip;
    const lat = landing.time;
    const outC = landing.country;
    const asnU = `${entrance.asn || ""} ${landing.asn || ""}`.toUpperCase();
    
    // 1. 嗅探贵族血统 (ASN)
    let premium = "";
    if (asnU.includes("4809")) premium = "CN2 GIA";
    else if (asnU.includes("9929")) premium = "联通 9929";
    else if (asnU.includes("58453")) premium = "移动 CMI";
    else if (asnU.includes("4134")) premium = "电信 163";

    // 2. 嗅探 CDN 特征
    const isCDN = inIP && entrance.isp.toUpperCase().includes("CLOUDFLARE");

    // 3. 延迟判断红线
    const isLowLat = (/(香港|台湾|澳门)/.test(outC) && lat < 60) || 
                     (/(日本|韩国)/.test(outC) && lat < 95) || 
                     (/(美国)/.test(outC) && lat < 210);

    // 4. 关键字背书
    const isKw = /(IPLC|IEPL|专线|BGP|AIA|深港|沪日|莞港)/.test(nameU);

    // --- 结论输出 ---
    
    // 情形 A：缺失入口数据 或 明确是 CDN 保护
    if (!inIP || isCDN) {
        let prefix = isCDN ? "☁️ CDN接入 | " : "❓ 盲测 | ";
        if (isKw || isLowLat) return premium ? `⟦ ${prefix}🚀 疑似专线 | ${premium} ⟧` : `⟦ ${prefix}🚀 疑似物理专线 ⟧`;
        return premium ? `⟦ ${prefix}✈️ 疑似中转 | ${premium} ⟧` : `⟦ ${prefix}✈️ 常规公网中转 ⟧`;
    }

    // 情形 B：数据齐全，严格判定
    if (inIP === outIP) {
        return premium ? `⟦ 🚄 优化直连 | ${premium} ⟧` : `⟦ 🚙 常规直连网络 ⟧`;
    } else {
        if (isKw || isLowLat) return premium ? `⟦ 🚀 顶级专线 | ${premium} ⟧` : `⟦ 🚀 优质物理专线 ⟧`;
        return premium ? `⟦ ✈️ 跨境中转 | ${premium} ⟧` : `⟦ ✈️ 常规公网中转 ⟧`;
    }
}


// ==========================================
// 翻译与展示组件
// ==========================================
function transISP(i) {
    if (!i) return "-";
    let u = i.toUpperCase();
    if (u.includes("CHINANET")||u.includes("TELECOM")) return "中国电信";
    if (u.includes("UNICOM")) return "中国联通";
    if (u.includes("MOBILE")) return "中国移动";
    if (u.includes("PCCW")||u.includes("HKT")) return "电讯盈科";
    if (u.includes("HINET")||u.includes("CHUNGHWA")) return "中华电信";
    if (u.includes("HKBN")) return "香港宽频";
    if (u.includes("CLOUDFLARE")) return "Cloudflare (CDN)";
    if (u.includes("AMAZON")||u.includes("AWS")) return "亚马逊云";
    if (u.includes("GOOGLE")||u.includes("GCP")) return "谷歌云";
    if (u.includes("ALIBABA")||u.includes("ALIPAY")) return "阿里云";
    if (u.includes("TENCENT")) return "腾讯云";
    if (u.includes("MICROSOFT")||u.includes("AZURE")) return "微软云";
    if (u.includes("NTT")) return "NTT";
    if (u.includes("KDDI")) return "KDDI";
    return i;
}

function transCountry(c) {
    if (!c) return "-";
    let d = {
        "CN":"中国","HK":"香港","TW":"台湾","MO":"澳门",
        "JP":"日本","KR":"韩国","SG":"新加坡","US":"美国",
        "UK":"英国","GB":"英国","CA":"加拿大","AU":"澳大利亚"
    };
    if (c.toUpperCase().includes("CHINA")) return "中国";
    if (c.toUpperCase().includes("TAIWAN")) return "台湾";
    if (c.toUpperCase().includes("HONG KONG")) return "香港";
    if (c.toUpperCase().includes("JAPAN")) return "日本";
    if (c.toUpperCase().includes("SINGAPORE")) return "新加坡";
    if (c.toUpperCase().includes("UNITED STATES")) return "美国";
    return d[c.toUpperCase()] || c;
}

function HIP(ip, h) { 
    return (h && ip && ip !== "-") ? ip.replace(/(\w{1,4})(\.|\:)(\w{1,4}|\*)$/,(_,x,y,z)=>`${"∗".repeat(x.length)}.${"∗".repeat(z.length)}`) : ip; 
}

function getFlag(c) { 
    if(!c||c==="-") return "";
    let code = c.toUpperCase();
    if(code === "TW") return "🇨🇳"; 
    try { return String.fromCodePoint(...code.split("").map(i=>127397+i.charCodeAt())); } catch (e) { return ""; }
}
