/**
 * 节点入口落地查询 - 大一统积分风控版 (终极形态)
 * 架构：前置拓扑漏斗 (分流直连/中转) + 后置四维积分引擎 (精准评级)
 * 探针：引入 HTTP 204 极速探针，结合广东出海物理红线
 * 仅支持 Loon - 在所有节点页面选择一个节点长按，出现菜单后进行测试
 */

const scriptName = "入口落地智能分析";

// ================== 核心配置与四大字典 ==================

// 1. 👑 贵族 ASN 字典 (定级：+3分)
const ASNDict = {
    "AS4809": "电信 CN2 GIA",
    "AS9929": "联通 CU VIP",
    "AS10099": "联通 CUG",
    "AS58453": "移动 CMIN2",
    "AS35993": "中华电信 Hinet",
    "AS4637": "Telstra 优化",
    "AS9299": "PCCW Global"
};

// 2. ☁️ CDN 与伪装特征字典 (定级：-2分)
const CDN_ASN = ["AS13335", "AS20940", "AS16625", "AS54113", "AS16509", "AS396982", "AS31898", "AS133199"];
const CDN_Keywords = ["cloudflare", "akamai", "fastly", "amazon", "cloudfront", "cdn77", "imperva", "sucuri"];
const Blocked_IPs = ["127.0.0.1", "0.0.0.0", "::1"];

// 3. 🏷️ 商家命名特征正则 (定级：+1分)
const regex_Premium = /(IPLC|IEPL|专线|唯云|AIA|游戏)/i;
const regex_Endpoints = /(深港|广港|莞港|沪日|沪韩|京德|京俄|广新|苏日)/i;

// 4. ⏱️ 物理延迟红线阈值 (以中国广东为起点的探针红线，包含握手税)
const Latency_Limits = {
    // 港/澳
    Zone_1: { keywords: /(港|HK|Hong Kong|澳|Macau)/i, fast: 60, normal: 120 },
    // 台/新/马/菲
    Zone_2: { keywords: /(台|TW|Taiwan|新|SG|Singapore|马|MY|Malaysia|菲|PH)/i, fast: 150, normal: 250 },
    // 日/韩
    Zone_3: { keywords: /(日|JP|Japan|韩|KR|Korea)/i, fast: 180, normal: 300 },
    // 美西/澳洲
    Zone_4: { keywords: /(美|US|America|澳|AU|Australia)/i, fast: 420, normal: 600 },
    // 欧/美东及其他
    Zone_5: { keywords: /(德|DE|英|UK|法|FR|欧|EU|俄|RU)/i, fast: 650, normal: 850 }
};

// ================== 主程序执行入口 ==================

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params || {};
        const nodeName = inputParams.node || "未知节点";
        const nodeAddress = (inputParams.nodeInfo && inputParams.nodeInfo.address) ? inputParams.nodeInfo.address : "";
        
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // 严格顺序 1：获取落地信息 & 真实物理延迟
        let landingInfo = {};
        let realPing = 9999; 
        try {
            const [ldRes, pingRes] = await Promise.all([
                getIPInfo("", nodeName),
                getRealPing(nodeName) // 触发 204 极速探针
            ]);
            landingInfo = ldRes;
            realPing = pingRes;
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

        // 🧠 核心大脑：调用拓扑漏斗 + 四维积分引擎
        let cfw = evaluateNode(entranceInfo, landingInfo, nodeName, realPing);

        // UI 渲染：组装入口文本
        let ins = "";
        if (entranceInfo.error) {
            ins = `<br>${entranceInfo.error}<br><br>`;
        } else {
            ins = `<b><font>入口位置</font>:</b>
        <font>${getflag(entranceInfo.countryCode)}${entranceInfo.country}</font><br><br>
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
        <font>${getflag(landingInfo.countryCode)}${landingInfo.country}&nbsp; ⚡${realPing}ms</font><br><br>
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

// ================== 核心：拓扑漏斗 + 四维积分引擎 ==================

function evaluateNode(ent, lnd, nodeName, realPing) {
    // 🔴 致命拦截：完全不通
    if (lnd.error) return "⟦ ⚠️ 节点未通 / 代理失效 ⟧";

    let entASN = extractASN(ent.asn);
    let lndASN = extractASN(lnd.asn);
    
    // ----------------- 模块一：定性 (拓扑漏斗) -----------------
    let isDirect = false;
    if (!ent.error && ent.ip) {
        if (ent.ip === lnd.ip) isDirect = true; // IP完全一致
        if (entASN && lndASN && entASN === lndASN) isDirect = true; // 同机房同ASN
    }

    // ----------------- 模块二：定量 (四维积分算分) -----------------
    let score = 0;
    let prefix = "";

    // 维度 1: 👑 贵族 ASN (+3分)
    if (ASNDict[lndASN]) {
        score += 3;
    }

    // 维度 2: ☁️ CDN 伪装剥离 (-2分)
    if (ent.error || Blocked_IPs.includes(ent.ip)) {
        prefix = "❓盲测 | "; // 查不到入口，不加不扣，打上盲测标签
    } else {
        const isCDN_ISP = CDN_Keywords.some(k => (ent.isp || "").toLowerCase().includes(k));
        if (CDN_ASN.includes(entASN) || isCDN_ISP) {
            score -= 2;
            prefix = "☁️CDN减速 | ";
        }
    }

    // 维度 3: 🏷️ 商家命名背书 (+1分)
    if (regex_Premium.test(nodeName) || regex_Endpoints.test(nodeName)) {
        score += 1;
    }

    // 维度 4: ⏱️ 物理延迟红线 (+3分 / +1分 / -1分)
    const lndStr = `${lnd.country} ${lnd.region} ${lnd.city}`;
    let fast_limit = 300; 
    let normal_limit = 500; 
    
    // 匹配广东专属红线
    if (Latency_Limits.Zone_1.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_1.fast; normal_limit = Latency_Limits.Zone_1.normal; }
    else if (Latency_Limits.Zone_2.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_2.fast; normal_limit = Latency_Limits.Zone_2.normal; }
    else if (Latency_Limits.Zone_3.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_3.fast; normal_limit = Latency_Limits.Zone_3.normal; }
    else if (Latency_Limits.Zone_4.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_4.fast; normal_limit = Latency_Limits.Zone_4.normal; }
    else if (Latency_Limits.Zone_5.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_5.fast; normal_limit = Latency_Limits.Zone_5.normal; }

    // 计算延迟得分
    if (realPing <= fast_limit) {
        score += 3;
    } else if (realPing <= normal_limit) {
        score += 1;
    } else {
        score -= 1;
    }

    // ----------------- 最终判决书输出 -----------------
    
    if (isDirect) {
        // 🟢 直连系判决
        if (score >= 4) return prefix + "⟦ 🚄 极品优化直连 ⟧";
        if (score >= 2) return prefix + "⟦ 🚙 优质常规直连 ⟧";
        if (score >= 0) return prefix + "⟦ 🐌 拥堵/平庸直连 ⟧";
        return prefix + "⟦ ⚠️ 劣质直连 / 减速云 ⟧";
    } else {
        // 🔵 中转/专线系判决
        if (score >= 4) return prefix + "⟦ 🚀 顶级物理专线 ⟧";
        if (score >= 2) return prefix + "⟦ ⚡ 优质高能中转 ⟧";
        if (score >= 0) return prefix + "⟦ ✈️ 常规公网中转 ⟧";
        return prefix + "⟦ ⚠️ 劣质/减速节点 ⟧";
    }
}

// ================== 工具函数 ==================

// 极速 204 物理延迟探针
async function getRealPing(node) {
    return new Promise((resolve) => {
        let start = Date.now();
        $httpClient.get({ url: "http://cp.cloudflare.com/generate_204", node: node, timeout: 3000 }, (err, resp) => {
            if (err || !resp || (resp.status !== 200 && resp.status !== 204)) {
                resolve(9999); 
            } else {
                resolve(Date.now() - start);
            }
        });
    });
}

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
            if (resp.status !== 200 && resp.status !== 204) return reject(new Error(`HTTP Error: ${resp.status}`));
            resolve(data || resp.status);
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
            let opts = { url: api.url, timeout: 4000 };
            if (node) opts.node = node; 

            let res = await httpGet(opts);
            let info = api.parser(res);
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
