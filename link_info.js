/**
 * 节点入口落地查询 - 五维漏斗智能研判版 (超神版)
 * 采用 物理断联拦截 -> 直连/血统鉴定 -> CDN剥离 -> 物理延迟测谎 -> 专线标签加冕 的五维混合计算引擎
 * 仅支持 Loon - 在所有节点页面选择一个节点长按，出现菜单后进行测试
 */

const scriptName = "入口落地智能分析";

// ================== 核心配置与四大字典 ==================

// 1. 👑 贵族 ASN 字典 (直连血统鉴定)
const ASNDict = {
    "AS4809": "电信 CN2 GIA",
    "AS9929": "联通 CU VIP",
    "AS10099": "联通 CUG",
    "AS58453": "移动 CMIN2",
    "AS35993": "中华电信 Hinet",
    "AS4637": "Telstra 优化",
    "AS9299": "PCCW Global",
    "AS4134": "电信 163",
    "AS4837": "联通 169",
    "AS9808": "移动 CMNET"
};

// 2. ☁️ CDN 与伪装特征字典 (剥离 CDN)
const CDN_ASN = ["AS13335", "AS20940", "AS16625", "AS54113", "AS16509", "AS396982", "AS31898", "AS133199"];
const CDN_Keywords = ["cloudflare", "akamai", "fastly", "amazon", "cloudfront", "cdn77", "imperva", "sucuri"];
const Blocked_IPs = ["127.0.0.1", "0.0.0.0", "::1"];

// 3. 🏷️ 商家命名特征正则 (专线白名单)
const regex_Premium = /(IPLC|IEPL|专线|唯云|AIA|游戏)/i;
const regex_Endpoints = /(深港|广港|莞港|沪日|沪韩|京德|京俄|广新|苏日)/i;

// 4. ⏱️ 物理延迟红线阈值 (测谎兜底，可根据你的软路由环境微调)
const Latency_Limits = {
    Zone_1: { keywords: /(港|HK|Hong Kong|澳|Macau|台|TW|Taiwan)/i, max_ms: 60 },
    Zone_2: { keywords: /(日|JP|Japan|韩|KR|Korea|新|SG|Singapore)/i, max_ms: 95 },
    Zone_3: { keywords: /(美|US|America|德|DE|英|UK|法|FR|欧|EU)/i, max_ms: 210 }
};

// ================== 主程序执行入口 ==================

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params || {};
        const nodeName = inputParams.node || "未知节点";
        const nodeAddress = (inputParams.nodeInfo && inputParams.nodeInfo.address) ? inputParams.nodeInfo.address : "";
        
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // 严格顺序 1：获取落地信息 (通过节点代理请求)
        let landingInfo = {};
        try {
            landingInfo = await getIPInfo("", nodeName);
        } catch (e) {
            landingInfo = { error: "LDFailed 落地查询超时或节点离线" };
        }

        // 严格顺序 2：获取入口信息 (解析域名后直连请求)
        let entranceInfo = {};
        try {
            if (!nodeAddress) throw new Error("无节点地址");
            let entranceIp = await resolveDomain(nodeAddress);
            entranceInfo = await getIPInfo(entranceIp, null);
        } catch (e) {
            entranceInfo = { error: "INFailed 入口查询失败" };
        }

        // 🧠 核心大脑：调用五维漏斗研判引擎
        let cfw = evaluateNode(entranceInfo, landingInfo, nodeName);

        // UI 渲染：组装入口文本
        let ins = "";
        if (entranceInfo.error) {
            ins = `<br>${entranceInfo.error}<br><br>`;
        } else {
            ins = `<b><font>入口位置</font>:</b>
        <font>${getflag(entranceInfo.countryCode)}${entranceInfo.country}&nbsp; ${entranceInfo.time}ms</font><br><br>
        <b><font>入口地区</font>:</b>
        <font>${entranceInfo.region} ${entranceInfo.city}</font><br><br>
        <b><font>入口IP地址</font>:</b>
        <font>${HIP(entranceInfo.ip, hideIP)}</font><br><br>
        <b><font>入口ISP</font>:</b>
        <font>${translateISP(entranceInfo.isp)}</font><br><br>`;
        }

        // UI 渲染：组装落地文本
        let outs = "";
        if (landingInfo.error) {
            outs = `<br>${landingInfo.error}<br><br>`;
        } else {
            outs = `<b><font>落地位置</font>:</b>
        <font>${getflag(landingInfo.countryCode)}${landingInfo.country}&nbsp; ${landingInfo.time}ms</font><br><br>
        <b><font>落地地区</font>:</b>
        <font>${landingInfo.region} ${landingInfo.city}</font><br><br>
        <b><font>落地IP地址</font>:</b>
        <font>${HIP(landingInfo.ip, hideIP)}</font><br><br>
        <b><font>落地ISP</font>:</b>
        <font>${landingInfo.isp}</font><br><br>
        <b><font>落地ASN</font>:</b>
        <font>${landingInfo.asn}</font><br>`;
        }

        // 最终 HTML
        let message = `<p style="text-align: center; font-family: -apple-system; font-size: large; font-weight: thin">
    <br>-------------------------------<br><br>
    ${ins}
    -------------------<br>
    <b><font color="#467fcf">${cfw}</font></b>
    <br>-------------------<br><br>
    ${outs}
    <br>-------------------------------<br><br>
    <b>节点</b>  ➟  ${nodeName} <br>
    <b>设备</b>  ➟ ${loonInfo[1]} ${loonInfo.length > 2 ? loonInfo[2] : ""}</p>`;

        $done({ title: scriptName, htmlMessage: message });

    } catch (error) {
        $done({
            title: scriptName,
            htmlMessage: `<p style="text-align: center;"><br>超脑引擎发生意外错误:<br>${error.message}</p>`
        });
    }
})();

// ================== 五维漏斗智能研判引擎 (The Brain) ==================

function evaluateNode(ent, lnd, nodeName) {
    // 🔴 第一维：致命拦截 (防断联与超时)
    if (lnd.error) return "⟦ ⚠️ 节点未通 / 代理失效 ⟧";

    let entASN = extractASN(ent.asn);
    let lndASN = extractASN(lnd.asn);
    let prefix = "";

    // 🔵 第二维：真理鉴定 (物理直连判定)
    let isDirect = false;
    if (!ent.error && ent.ip) {
        if (ent.ip === lnd.ip) isDirect = true; // 绝对相等
        if (entASN && lndASN && entASN === lndASN) isDirect = true; // 同机房同ASN容差
    }

    if (isDirect) {
        if (ASNDict[lndASN]) return `⟦ 🚄 优化直连 | ${ASNDict[lndASN]} ⟧`;
        return "⟦ 🚙 常规直连网络 ⟧";
    }

    // 🟡 第三维：迷雾剥离 (CDN / 盲测推断)
    if (ent.error || Blocked_IPs.includes(ent.ip)) {
        prefix = "❓盲测 | ";
    } else {
        const isCDN_ISP = CDN_Keywords.some(k => (ent.isp || "").toLowerCase().includes(k));
        if (CDN_ASN.includes(entASN) || isCDN_ISP) {
            prefix = "☁️CDN接入 | ";
        }
    }

    // 🟢 第四维：物理测谎仪兜底 (延迟红线)
    let max_ms = 300; // 默认放宽到 300ms
    let zone = "未知区域";
    const lndStr = `${lnd.country} ${lnd.region} ${lnd.city}`;

    if (Latency_Limits.Zone_1.keywords.test(lndStr)) { max_ms = Latency_Limits.Zone_1.max_ms; zone = "极速圈"; }
    else if (Latency_Limits.Zone_2.keywords.test(lndStr)) { max_ms = Latency_Limits.Zone_2.max_ms; zone = "近邻圈"; }
    else if (Latency_Limits.Zone_3.keywords.test(lndStr)) { max_ms = Latency_Limits.Zone_3.max_ms; zone = "跨海圈"; }

    // 🔮 异常兜底：BGP 漂移悖论拦截 (比如落地显示美国，但延迟极低)
    if (zone === "跨海圈" && lnd.time < 60) {
        return prefix + "⟦ 🔮 伪装归属地 / BGP广播 ⟧";
    }

    // 测谎判定：延迟超标，一票否决为常规中转
    if (lnd.time > max_ms) {
        return prefix + "⟦ ✈️ 常规公网中转 ⟧";
    }

    // 🟣 第五维：标签背书 (活到最后，用名字加冕)
    if (regex_Premium.test(nodeName) || regex_Endpoints.test(nodeName)) {
        return prefix + "⟦ 🚀 顶级物理专线 ⟧";
    }
    
    // 如果延迟达标但名字没写专线
    return prefix + "⟦ ⚡ 优质低延迟中转 ⟧";
}

// ================== 工具函数 ==================

function extractASN(asnStr) {
    if (!asnStr) return "";
    let match = asnStr.match(/AS\d+/i);
    return match ? match[0].toUpperCase() : "";
}

function translateISP(isp) {
    if (!isp) return "";
    const lowerISP = isp.toLowerCase();
    if (lowerISP.includes("chinanet") || lowerISP.includes("telecom")) return "中国电信";
    if (lowerISP.includes("unicom")) return "中国联通";
    if (lowerISP.includes("mobile")) return "中国移动";
    if (lowerISP.includes("broadcasting") || lowerISP.includes("cbn")) return "中国广电";
    if (lowerISP.includes("alibaba") || lowerISP.includes("alipay")) return "阿里云";
    if (lowerISP.includes("tencent")) return "腾讯云";
    return isp; 
}

function httpGet(opts) {
    return new Promise((resolve, reject) => {
        $httpClient.get(opts, (err, resp, data) => {
            if (err) return reject(err);
            if (resp.status !== 200) return reject(new Error(`HTTP Error: ${resp.status}`));
            resolve(data);
        });
    });
}

async function getIPInfo(ip, node = null) {
    const targetIp = ip ? `${ip}` : "";
    const apis = [
        { url: `http://ip-api.com/json/${targetIp}?lang=zh-CN`, parser: parseIpApi },
        { url: `https://api-ipv4.ip.sb/geoip/${targetIp}`, parser: parseIpSb }
    ];

    for (let api of apis) {
        try {
            let start = Date.now();
            let opts = { url: api.url, timeout: 4000 };
            if (node) opts.node = node; 

            let res = await httpGet(opts);
            let info = api.parser(res);
            info.time = Date.now() - start;
            for(let key in info) { if(!info[key]) info[key] = ""; }
            return info;
        } catch (e) { continue; }
    }
    throw new Error("接口超时");
}

function parseIpApi(data) {
    let json = JSON.parse(data);
    if (json.status !== 'success') throw new Error("API异常");
    return {
        ip: json.query || "",
        country: (json.country || "").replace(/中国\s*/, ''),
        countryCode: json.countryCode || "",
        region: json.regionName || "",
        city: json.city || "",
        isp: json.isp || json.org || "",
        asn: json.as || ""
    };
}

function parseIpSb(data) {
    let json = JSON.parse(data);
    return {
        ip: json.ip || "",
        country: (json.country || "").replace(/中国\s*/, ''),
        countryCode: json.country_code || "",
        region: json.region || "",
        city: json.city || "",
        isp: json.isp || json.organization || "",
        asn: json.asn ? `AS${json.asn}` : ''
    };
}

async function resolveDomain(domain) {
    if (/^[0-9.]+$/.test(domain) || /:/.test(domain)) return domain; 
    try {
        let res = await httpGet({ url: `https://223.5.5.5/resolve?name=${domain}&type=A&short=1`, timeout: 3000 });
        let ips = JSON.parse(res);
        if (ips && Array.isArray(ips) && ips.length > 0) return ips[0];
    } catch (e) {}
    return domain;
}

function HIP(ip, isHide) {
    if (!ip) return "";
    if (!isHide) return ip;
    return ip.replace(/(\w{1,4})(\.|\:)(\w{1,4}|\*)$/,(_, x, y, z) => `${"∗".repeat(x.length)}.${"∗".repeat(z.length)}`);
}

function getflag(countryCode) {
    if (!countryCode) return "";
    const code = countryCode.toUpperCase();
    if (code === "TW") return "🇨🇳"; 
    const flag = code.split("").map(c => 127397 + c.charCodeAt());
    return String.fromCodePoint(...flag);
}
