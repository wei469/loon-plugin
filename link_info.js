/**
 * 节点入口落地查询 - 究极全能逻辑版
 * * 核心进化：
 * 1. 逻辑回归：采用“极速主用 + 稳健备用”串行模式，1.5秒无缝切换。
 * 2. 数据清洗：自动剔除节点地址中的端口号，支持域名预解析。
 * 3. 智能猜想：入口查询失败时，根据延迟与关键字进行启发式研判。
 * 4. 冲突校正：硬性过滤落地 IP 等于本机 IP 的打脸情况。
 * 5. 全面汉化：植入深度 ISP 翻译字典与五维研判勋章。
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const { node: nodeName, nodeInfo } = $environment.params;
        const nodeAddrRaw = nodeInfo.address;
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // --- 第一步：数据清洗与预处理 ---
        // 剥离端口号 (针对 ofoNET 等不规范格式)
        const cleanNodeAddr = nodeAddrRaw.split(':')[0].trim();

        // --- 第二步：多端数据并行获取 (获取三端数据) ---
        let [local, landing, entranceIp] = await Promise.all([
            fetchSerial("", "DIRECT"), // 获取本机真实网络信息
            fetchSerial("", nodeName), // 获取落地代理网络信息
            resolveDomain(cleanNodeAddr) // 将节点地址转为纯 IP
        ]);

        // 获取入口具体信息 (使用直连查询入口 IP)
        let entrance = await fetchSerial(entranceIp, "DIRECT").catch(e => ({ error: true }));

        // --- 第三步：核心智能研判体系 ---
        let linkResult = "";
        
        // 1. 优先级最高：冲突检测 (节点未生效)
        if (!local.error && !landing.error && local.ip === landing.ip) {
            linkResult = "⟦ ⚠️ 节点未通/直连 ⟧";
        } 
        // 2. 优先级第二：正常研判或智能猜想
        else if (!landing.error) {
            // 如果入口查到了，走完整五维研判；如果入口没查到，走启发式猜想
            linkResult = judgeLinkSmart(
                entrance.error ? null : entrance.ip, 
                landing.ip, 
                entrance.asn || "-", 
                landing.asn, 
                landing.time, 
                landing.country, 
                nodeName
            );
        } else {
            linkResult = "⟦ ❌ 探测失败/超时 ⟧";
        }

        // --- 第四步：UI 渲染与展示 ---
        let localStr = local.error ? `🔴 本机查询失败<br>` : 
            `<b>本机:</b> ${getFlag(local.countryCode)} ${local.country} ${local.isp} (${HIP(local.ip, hideIP)})<br>`;
        
        let inStr = (entrance.error || !entrance.ip) ? `🟡 入口信息获取跳过/超时<br>` : 
            `<b>入口:</b> ${getFlag(entrance.countryCode)} ${entrance.country} ${entrance.isp} (${HIP(entrance.ip, hideIP)})<br>`;

        let outStr = landing.error ? `🔴 落地查询失败<br>` : 
            `<b>落地:</b> ${getFlag(landing.countryCode)} ${landing.country} ${landing.isp}<br>` +
            `<b>ASN:</b> ${landing.asn} (${landing.time}ms)<br>` +
            `<b>出口:</b> ${HIP(landing.ip, hideIP)}<br>`;

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
        $done({ title: scriptName, htmlMessage: `脚本崩溃: ${e.message}` });
    }
})();

/**
 * 核心研判引擎：带智能猜想功能
 */
function judgeLinkSmart(inIP, outIP, inASN, outASN, lat, outC, name) {
    const nameU = name.toUpperCase();
    const asnU = `${inASN}${outASN}`.toUpperCase();
    
    // 识别核心优化线路标签
    let premium = "";
    if (asnU.includes("4809")) premium = "CN2 GIA";
    else if (asnU.includes("9929")) premium = "联通 9929";
    else if (asnU.includes("58453")) premium = "移动 CMI";
    else if (asnU.includes("4134")) premium = "电信 163";

    // 延迟库判定
    const isLowLat = (/(香港|HK)/.test(outC) && lat < 60) || 
                     (/(日本|JP|台湾|TW|韩国|KR)/.test(outC) && lat < 95) || 
                     (/(美国|US)/.test(outC) && lat < 210);
    
    // 关键字判定
    const isKw = /(IPLC|IEPL|专线|BGP|AIA|深港|沪日|莞港)/.test(nameU);

    // 逻辑 A：入口数据缺失时的“智能猜想”
    if (!inIP) {
        if (isKw || isLowLat) return premium ? `⟦ 🚀 疑似专线 | ${premium} ⟧` : `⟦ 🚀 疑似物理专线 ⟧`;
        return premium ? `⟦ ✈️ 疑似中转 | ${premium} ⟧` : `⟦ ✈️ 常规公网中转 ⟧`;
    }

    // 逻辑 B：数据齐全时的“严谨研判”
    if (inIP === outIP) return premium ? `⟦ 🚄 准直连 | ${premium} ⟧` : `⟦ 🚙 准直连网络 ⟧`;
    if (isKw || isLowLat) return premium ? `⟦ 🚀 顶级专线 | ${premium} ⟧` : `⟦ 🚀 优质物理专线 ⟧`;
    return premium ? `⟦ ✈️ 优化中转 | ${premium} ⟧` : `⟦ ✈️ 常规公网中转 ⟧`;
}

/**
 * 串行请求：主用 + 1.5秒极速备份模式
 */
function fetchSerial(ip, node) {
    const target = ip ? `/${ip}` : "";
    const apis = [
        { url: `http://ip-api.com/json${target}?lang=zh-CN`, p: parseIpApi },
        { url: `https://api-ipv4.ip.sb/geoip${target}`, p: parseIpSb }
    ];

    return new Promise((resolve, reject) => {
        let currentIndex = 0;

        const doRequest = () => {
            const api = apis[currentIndex];
            let start = Date.now();
            let hasTimedOut = false;

            // 1.5秒超时控制器 (主接口)
            const timer = setTimeout(() => {
                hasTimedOut = true;
                handleNext();
            }, currentIndex === 0 ? 1500 : 3000);

            $httpClient.get({ 
                url: api.url, 
                node: node === "DIRECT" ? null : node 
            }, (err, resp, data) => {
                if (hasTimedOut) return;
                clearTimeout(timer);

                if (!err && resp.status === 200) {
                    try {
                        let info = api.p(data);
                        info.time = Date.now() - start;
                        resolve(info);
                    } catch(e) { handleNext(); }
                } else { handleNext(); }
            });
        };

        const handleNext = () => {
            currentIndex++;
            if (currentIndex < apis.length) doRequest();
            else reject(new Error("Timeout"));
        };

        doRequest();
    });
}

// --- 基础工具函数 (ISP 字典与解析) ---
function parseIpApi(d) {
    let j = JSON.parse(d);
    return { ip: j.query, country: j.country, countryCode: j.countryCode, isp: transISP(j.isp||j.org), asn: j.as?j.as.split(" ")[0]:"-" };
}
function parseIpSb(d) {
    let j = JSON.parse(d);
    return { ip: j.ip, country: transCountry(j.country), countryCode: j.country_code, isp: transISP(j.isp||j.organization), asn: j.asn?`AS${j.asn}`:"-" };
}
function transISP(i) {
    let u = i.toUpperCase();
    if (u.includes("CHINANET")||u.includes("TELECOM")) return "中国电信";
    if (u.includes("UNICOM")) return "中国联通";
    if (u.includes("MOBILE")) return "中国移动";
    if (u.includes("PCCW")||u.includes("HKT")) return "电讯盈科";
    if (u.includes("HINET")||u.includes("CHUNGHWA")) return "中华电信";
    if (u.includes("CLOUDFLARE")) return "Cloudflare";
    if (u.includes("AMAZON")||u.includes("AWS")) return "亚马逊云";
    if (u.includes("GOOGLE")) return "谷歌云";
    return i;
}
function transCountry(c) {
    let d = {"CN":"中国","HK":"香港","TW":"台湾","JP":"日本","US":"美国","SG":"新加坡","KR":"韩国"};
    return d[c.toUpperCase()] || c;
}
async function resolveDomain(d) {
    if (/^[0-9.]+$/.test(d)) return d;
    return new Promise(r => {
        $httpClient.get({url:`http://223.5.5.5/resolve?name=${d}&type=A&short=1`,timeout:2000}, (e,s,body) => {
            try { r(JSON.parse(body)[0] || d); } catch(err) { r(d); }
        });
    });
}
function HIP(ip, h) { return (h && ip !== "-") ? "∗∗∗.∗∗∗.∗∗∗.∗∗∗" : ip; }
function getFlag(c) { 
    if(!c||c==="-") return "";
    if(c.toUpperCase()==="TW") return "🇨🇳";
    return String.fromCodePoint(...c.toUpperCase().split("").map(i=>127397+i.charCodeAt()));
}
