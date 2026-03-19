/**
 * 节点入口落地查询 - 大一统积分风控版 (纯粹物理唯物终极版)
 * 架构：前置拓扑漏斗 + 后置三维积分引擎 + 极简诊断标签 + 海量汉化词库
 * 核心：废除所有商家命名加分，绝对公平对决。引入广东出海 +5% 宽容度红线。
 * 仅支持 Loon - 在所有节点页面选择一个节点长按，出现菜单后进行测试
 */

const scriptName = "入口落地智能分析";

// ================== 核心配置与三大物理字典 ==================

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

// 2. ☁️ CDN 与伪装特征字典 (定级：-1分)
const CDN_ASN = ["AS13335", "AS20940", "AS16625", "AS54113", "AS16509", "AS396982", "AS31898", "AS133199"];
const CDN_Keywords = ["cloudflare", "akamai", "fastly", "amazon", "cloudfront", "cdn77", "imperva", "sucuri"];
const Blocked_IPs = ["127.0.0.1", "0.0.0.0", "::1"];

// 3. ⏱️ 物理延迟红线阈值 (广东视角 + 5% 网络抖动宽容度)
const Latency_Limits = {
    Zone_1: { keywords: /(港|HK|Hong Kong|澳|Macau)/i, fast: 63, normal: 126 },
    Zone_2: { keywords: /(台|TW|Taiwan|新|SG|Singapore|马|MY|Malaysia|菲|PH)/i, fast: 157, normal: 262 },
    Zone_3: { keywords: /(日|JP|Japan|韩|KR|Korea)/i, fast: 189, normal: 315 },
    Zone_4: { keywords: /(美|US|America|澳|AU|Australia)/i, fast: 441, normal: 630 },
    Zone_5: { keywords: /(德|DE|英|UK|法|FR|欧|EU|俄|RU)/i, fast: 682, normal: 892 }
};

// ================== 主程序执行入口 ==================

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params || {};
        const nodeName = inputParams.node || "未知节点";
        const nodeAddress = (inputParams.nodeInfo && inputParams.nodeInfo.address) ? inputParams.nodeInfo.address : "";
        
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // 获取落地信息 & 真实物理延迟
        let landingInfo = {};
        let realPing = 9999; 
        try {
            const [ldRes, pingRes] = await Promise.all([
                getIPInfo("", nodeName),
                getRealPing(nodeName) 
            ]);
            landingInfo = ldRes;
            realPing = pingRes;
        } catch (e) {
            landingInfo = { error: "LDFailed 落地查询超时或节点离线" };
        }

        // 获取入口信息
        let entranceInfo = {};
        try {
            if (!nodeAddress) throw new Error("无节点地址");
            let entranceIp = await resolveDomain(nodeAddress);
            entranceInfo = await getIPInfo(entranceIp, null);
        } catch (e) {
            entranceInfo = { error: "INFailed 入口查询失败" };
        }

        // 🧠 核心大脑：调用拓扑漏斗 + 三维积分引擎
        let cfw = evaluateNode(entranceInfo, landingInfo, realPing);

        // UI 渲染
        let ins = entranceInfo.error ? `<br>${entranceInfo.error}<br><br>` : 
        `<b><font>入口位置</font>:</b>
        <font>${getflag(entranceInfo.countryCode)}${entranceInfo.country}</font><br><br>
        <b><font>入口地区</font>:</b>
        <font>${entranceInfo.region} ${entranceInfo.city}</font><br><br>
        <b><font>入口IP地址</font>:</b>
        <font>${HIP(entranceInfo.ip, hideIP)}</font><br><br>
        <b><font>入口ISP</font>:</b>
        <font>${translateISP(entranceInfo.isp)}</font><br><br>`;

        let outs = landingInfo.error ? `<br>${landingInfo.error}<br><br>` : 
        `<b><font>落地位置</font>:</b>
        <font>${getflag(landingInfo.countryCode)}${landingInfo.country}&nbsp; ⚡${realPing}ms</font><br><br>
        <b><font>落地地区</font>:</b>
        <font>${landingInfo.region} ${landingInfo.city}</font><br><br>
        <b><font>落地IP地址</font>:</b>
        <font>${HIP(landingInfo.ip, hideIP)}</font><br><br>
        <b><font>落地ISP</font>:</b>
        <font>${translateISP(landingInfo.isp)}</font><br><br>
        <b><font>落地ASN</font>:</b>
        <font>${landingInfo.asn}</font><br>`;

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

// ================== 核心：拓扑漏斗 + 三维积分引擎 + 诊断标签 ==================

function evaluateNode(ent, lnd, realPing) {
    if (lnd.error) return "⟦ ⚠️ 节点未通 / 代理失效 ⟧";

    let entASN = extractASN(ent.asn);
    let lndASN = extractASN(lnd.asn);
    
    // ----------------- 模块一：定性 (拓扑漏斗) -----------------
    let isDirect = false;
    if (!ent.error && ent.ip) {
        if (ent.ip === lnd.ip) isDirect = true; 
        if (entASN && lndASN && entASN === lndASN) isDirect = true; 
    }

    // ----------------- 模块二：定量 (三维积分与标签收集) -----------------
    let score = 0;
    let posTags = []; // 加分项展示池
    let negTags = []; // 扣分项展示池

    // 维度 1: 👑 贵族 ASN (+3分)
    if (ASNDict[lndASN]) {
        score += 3;
        posTags.push("贵族专网");
    }

    // 维度 2: ☁️ CDN 伪装剥离 (-1分)
    if (ent.error || Blocked_IPs.includes(ent.ip)) {
        score -= 1;
        negTags.push("入口盲测");
    } else {
        const isCDN_ISP = CDN_Keywords.some(k => (ent.isp || "").toLowerCase().includes(k));
        if (CDN_ASN.includes(entASN) || isCDN_ISP) {
            score -= 1;
            negTags.push("CDN减速壳");
        }
    }

    // 维度 3: ⏱️ 物理延迟红线 (+3分 / +1分 / -1分)
    const lndStr = `${lnd.country} ${lnd.region} ${lnd.city}`;
    let fast_limit = 300; 
    let normal_limit = 500; 
    
    if (Latency_Limits.Zone_1.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_1.fast; normal_limit = Latency_Limits.Zone_1.normal; }
    else if (Latency_Limits.Zone_2.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_2.fast; normal_limit = Latency_Limits.Zone_2.normal; }
    else if (Latency_Limits.Zone_3.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_3.fast; normal_limit = Latency_Limits.Zone_3.normal; }
    else if (Latency_Limits.Zone_4.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_4.fast; normal_limit = Latency_Limits.Zone_4.normal; }
    else if (Latency_Limits.Zone_5.keywords.test(lndStr)) { fast_limit = Latency_Limits.Zone_5.fast; normal_limit = Latency_Limits.Zone_5.normal; }

    if (realPing <= fast_limit) {
        score += 3;
        posTags.push("延迟极速");
    } else if (realPing <= normal_limit) {
        score += 1;
        posTags.push("延迟达标"); 
    } else {
        score -= 1;
        negTags.push("延迟拥堵");
    }

    // ----------------- 标签智能组装 -----------------
    let tagsStr = "";
    if (score >= 1) {
        // 第一档、第二档：展示光荣的加分项
        if (posTags.length > 0) tagsStr = " ｜ " + posTags.join(" · ");
    } else {
        // 第三档、第四档：扒下底裤，展示导致低分的痛点项
        if (negTags.length > 0) tagsStr = " ｜ " + negTags.join(" · ");
    }

    // ----------------- 最终判决书输出 (前缀精简版) -----------------
    if (isDirect) {
        if (score >= 3) return `⟦ 🚄 极品直连${tagsStr} ⟧`;
        if (score >= 1) return `⟦ 🚙 优质直连${tagsStr} ⟧`;
        if (score === 0) return `⟦ 🐌 平庸直连${tagsStr} ⟧`;
        return `⟦ ⚠️ 劣质直连/减速云${tagsStr} ⟧`;
    } else {
        if (score >= 3) return `⟦ 🚀 顶级专线${tagsStr} ⟧`;
        if (score >= 1) return `⟦ ⚡ 优质中转${tagsStr} ⟧`;
        if (score === 0) return `⟦ ✈️ 常规中转${tagsStr} ⟧`;
        return `⟦ ⚠️ 劣质/减速节点${tagsStr} ⟧`;
    }
}

// ================== 工具函数 ==================

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

// 🌐 海量 IDC 汉化字典引擎
function translateISP(isp) {
    if (!isp) return "";
    const lowerISP = isp.toLowerCase();
    
    // 国内三大运营商及基础网络
    if (lowerISP.includes("chinanet") || lowerISP.includes("telecom")) return "中国电信";
    if (lowerISP.includes("unicom")) return "中国联通";
    if (lowerISP.includes("mobile")) return "中国移动";
    if (lowerISP.includes("broadcasting") || lowerISP.includes("cbn")) return "中国广电";
    if (lowerISP.includes("drpeng") || lowerISP.includes("great wall")) return "长城宽带/鹏博士";
    
    // 国内主流云服务商
    if (lowerISP.includes("alibaba") || lowerISP.includes("alipay") || lowerISP.includes("taobao")) return "阿里云";
    if (lowerISP.includes("tencent")) return "腾讯云";
    if (lowerISP.includes("huawei")) return "华为云";
    if (lowerISP.includes("baidu")) return "百度云";
    if (lowerISP.includes("ucloud")) return "优刻得 (UCloud)";
    if (lowerISP.includes("bytedance") || lowerISP.includes("volce")) return "字节跳动 (火山引擎)";
    if (lowerISP.includes("kingsoft")) return "金山云";
    if (lowerISP.includes("jdcloud") || lowerISP.includes("jd.com")) return "京东云";
    if (lowerISP.includes("qiniu")) return "七牛云";
    
    // 国内知名 IDC 数据中心
    if (lowerISP.includes("lesuyun")) return "乐速云 (Lesuyun)";
    if (lowerISP.includes("vianet") || lowerISP.includes("century")) return "世纪互联";
    if (lowerISP.includes("chinanetcenter") || lowerISP.includes("wangsu")) return "网宿科技";
    
    // 海外主流云服务商 / 常见机房
    if (lowerISP.includes("amazon") || lowerISP.includes("aws")) return "亚马逊 (AWS)";
    if (lowerISP.includes("microsoft") || lowerISP.includes("azure")) return "微软 (Azure)";
    if (lowerISP.includes("google")) return "谷歌云 (GCP)";
    if (lowerISP.includes("oracle")) return "甲骨文 (Oracle)";
    if (lowerISP.includes("digitalocean") || lowerISP.includes("digital ocean")) return "DigitalOcean";
    if (lowerISP.includes("linode") || lowerISP.includes("akamai")) return "Akamai / Linode";
    if (lowerISP.includes("vultr") || lowerISP.includes("choopa")) return "Vultr";
    if (lowerISP.includes("cloudflare")) return "Cloudflare";
    if (lowerISP.includes("hetzner")) return "Hetzner";
    if (lowerISP.includes("ovh")) return "OVH";
    if (lowerISP.includes("equinix")) return "Equinix";

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
