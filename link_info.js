/**
 * 节点入口落地查询 - 终极多维研判汉化版 (动态Emoji UI升级版)
 * 特性：三级接口兜底 + 全链路中文化 + 四维智能线路研判 + 专属段位图标
 * 适用：仅支持 Loon - 在所有节点页面选择一个节点长按，出现菜单后进行测试
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params;
        const nodeName = inputParams.node;
        const nodeIp = inputParams.nodeInfo.address;
        
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // 1. 获取落地信息
        let landingInfo = {};
        try {
            landingInfo = await getIPInfo("", nodeName);
        } catch (e) {
            landingInfo = { error: "LDFailed 落地查询节点超时" };
        }

        // 2. 获取入口信息
        let entranceInfo = {};
        try {
            let entranceIp = await resolveDomain(nodeIp);
            entranceInfo = await getIPInfo(entranceIp, null);
        } catch (e) {
            entranceInfo = { error: "INFailed 入口查询超时" };
        }

        // 3. 核心：四维智能链路研判 (带Emoji增强)
        let cfw = "⟦ ❓ 未知状态 ⟧";
        if (!entranceInfo.error && !landingInfo.error) {
            cfw = judgeLinkType(
                entranceInfo.ip, landingInfo.ip, 
                entranceInfo.asn, landingInfo.asn, 
                landingInfo.time, landingInfo.country, nodeName
            );
        } else {
            cfw = "⟦ ❌ 网络探测失败 ⟧";
        }

        // 4. 组装入口 UI
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
        <font>${entranceInfo.isp}</font><br><br>`;
        }

        // 5. 组装落地 UI
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

        // 6. 渲染输出
        let message = `<p 
    style="text-align: center; 
    font-family: -apple-system; 
    font-size: large; 
    font-weight: thin">
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
        console.log("执行错误: " + error.message);
        $done({ title: scriptName, htmlMessage: `<p style="text-align: center;"><br>脚本执行意外错误:<br>${error.message}</p>` });
    }
})();

// ================= 核心链路智能研判逻辑 (Emoji升级) =================
function judgeLinkType(inIP, outIP, inASN, outASN, latency, outCountry, nodeName) {
    let isDirect = (inIP === outIP);
    let asnStr = `${inASN} ${outASN}`.toUpperCase();
    let nameStr = nodeName.toUpperCase();
    
    // 1. 抓取顶级优化路由特征
    let premiumRoute = "";
    if (asnStr.includes("4809")) premiumRoute = "CN2 GIA";
    else if (asnStr.includes("9929")) premiumRoute = "联通 9929";
    else if (asnStr.includes("58453")) premiumRoute = "移动 CMI";
    else if (asnStr.includes("4134")) premiumRoute = "电信 163";

    // 2. 建立地区 HTTP 延迟特征库
    let isLowLatency = false;
    let cty = outCountry.toUpperCase();
    if ((cty.includes("香港") || cty.includes("HK")) && latency < 65) isLowLatency = true;
    else if ((cty.includes("日本") || cty.includes("JP") || cty.includes("台湾") || cty.includes("TW")) && latency < 100) isLowLatency = true;
    else if ((cty.includes("新加坡") || cty.includes("SG")) && latency < 110) isLowLatency = true;
    else if ((cty.includes("美国") || cty.includes("US")) && latency < 210) isLowLatency = true;

    // 3. 提取节点名称特征
    let isKeywordIPLC = /(IPLC|IEPL|专线|BGP|AIA|深港|沪日|莞港|京德)/.test(nameStr);

    // 4. 综合研判输出 (加入动态表情)
    if (isDirect) {
        if (inASN === outASN && inASN !== "-") return premiumRoute ? `⟦ 🚄 准直连 | ${premiumRoute} ⟧` : `⟦ 🚙 准直连网络 ⟧`;
        return premiumRoute ? `⟦ 🚄 原生直连 | ${premiumRoute} ⟧` : `⟦ 🚙 常规直连 ⟧`;
    } else {
        if (isKeywordIPLC || isLowLatency) {
            return premiumRoute ? `⟦ 🚀 顶级专线 | ${premiumRoute} ⟧` : `⟦ 🚀 优质物理专线 ⟧`;
        } else {
            return premiumRoute ? `⟦ ✈️ 跨境中转 | ${premiumRoute} ⟧` : `⟦ ✈️ 常规公网中转 ⟧`;
        }
    }
}

// ================= 网络接口请求与防超时 =================
function httpGet(opts) {
    return new Promise((resolve, reject) => {
        $httpClient.get(opts, (err, resp, data) => {
            if (err) return reject(err);
            if (resp.status !== 200) return reject(new Error(`HTTP Error: ${resp.status}`));
            resolve(data);
        });
    });
}

async function getIPInfo(ip, nodeName = null) {
    const targetIp = ip ? `/${ip}` : "";
    const apis = [
        { url: `http://ip-api.com/json${targetIp}?lang=zh-CN`, parser: parseIpApi },
        { url: `https://api-ipv4.ip.sb/geoip${targetIp}`, parser: parseIpSb },
        { url: `https://ipinfo.io${targetIp}/json`, parser: parseIpInfo }
    ];

    for (let api of apis) {
        try {
            let start = Date.now();
            let opts = { url: api.url, timeout: 5000 };
            if (nodeName) opts.node = nodeName;

            let res = await httpGet(opts);
            let info = api.parser(res);
            info.time = Date.now() - start;
            for(let key in info) { if(!info[key]) info[key] = "-"; }
            return info;
        } catch (e) {
            console.log(`[切换] ${api.url} 失败，启用备用...`);
            continue;
        }
    }
    throw new Error("查询接口全线崩溃");
}

// ================= 数据清洗与中文翻译器 =================
function parseIpApi(data) {
    let json = JSON.parse(data);
    if (json.status !== 'success') throw new Error("API返回异常");
    return {
        ip: json.query,
        country: translateCountry(json.country),
        countryCode: json.countryCode,
        region: json.regionName,
        city: json.city,
        isp: translateISP(json.isp || json.org || json.as),
        asn: json.as ? json.as.split(" ")[0] : "-"
    };
}

function parseIpSb(data) {
    let json = JSON.parse(data);
    return {
        ip: json.ip,
        country: translateCountry(json.country),
        countryCode: json.country_code,
        region: json.region,
        city: json.city,
        isp: translateISP(json.isp || json.organization),
        asn: json.asn ? `AS${json.asn}` : "-"
    };
}

function parseIpInfo(data) {
    let json = JSON.parse(data);
    if (json.bogon) throw new Error("内网或保留IP");
    return {
        ip: json.ip,
        country: translateCountry(json.country), 
        countryCode: json.country,
        region: json.region,
        city: json.city,
        isp: translateISP(json.org),
        asn: json.org ? json.org.split(" ")[0] : "-"
    };
}

// 运营商全维度中文翻译字典
function translateISP(isp) {
    if (!isp) return "-";
    let upper = isp.toUpperCase();
    
    // 大陆基建
    if (upper.includes("CHINANET") || upper.includes("TELECOM")) return "中国电信";
    if (upper.includes("UNICOM")) return "中国联通";
    if (upper.includes("MOBILE")) return "中国移动";
    if (upper.includes("BROADCASTING") || upper.includes("CBN")) return "中国广电";
    if (upper.includes("CERNET")) return "教育网";
    if (upper.includes("TENCENT")) return "腾讯云";
    if (upper.includes("ALIBABA") || upper.includes("ALIPAY") || upper.includes("TAOBAO")) return "阿里云";
    if (upper.includes("HUAWEI")) return "华为云";
    if (upper.includes("UCLOUD")) return "优刻得 (UCloud)";
    
    // 港澳台及海外主流
    if (upper.includes("HKBN")) return "香港宽频 (HKBN)";
    if (upper.includes("PCCW") || upper.includes("HKT")) return "电讯盈科 (PCCW)";
    if (upper.includes("HINET") || upper.includes("CHUNGHWA")) return "中华电信 (HiNet)";
    if (upper.includes("AMAZON") || upper.includes("AWS")) return "亚马逊云 (AWS)";
    if (upper.includes("MICROSOFT") || upper.includes("AZURE")) return "微软云 (Azure)";
    if (upper.includes("GOOGLE") || upper.includes("GCP")) return "谷歌云 (GCP)";
    if (upper.includes("ORACLE")) return "甲骨文云 (Oracle)";
    if (upper.includes("CLOUDFLARE")) return "Cloudflare";
    if (upper.includes("DIGITALOCEAN")) return "DigitalOcean";
    if (upper.includes("LINODE")) return "Linode";
    if (upper.includes("VULTR")) return "Vultr";
    if (upper.includes("KDD") || upper.includes("KDDI")) return "KDDI";
    if (upper.includes("SOFTBANK")) return "软银 (SoftBank)";
    if (upper.includes("NTT")) return "NTT";
    if (upper.includes("IIJ")) return "IIJ";
    if (upper.includes("STARLINK")) return "星链 (Starlink)";
    if (upper.includes("CHUNGHWA TELECOM")) return "中华电信";
    if (upper.includes("FAR EASTONE")) return "远传电信";
    
    return isp;
}

// 国家/地区极致中文修正
function translateCountry(c) {
    if (!c) return "-";
    let dict = {
        "CN": "中国", "HK": "香港", "TW": "台湾", "MO": "澳门", "JP": "日本", "KR": "韩国",
        "SG": "新加坡", "US": "美国", "UK": "英国", "GB": "英国", "CA": "加拿大", "AU": "澳大利亚",
        "DE": "德国", "FR": "法国", "IN": "印度", "MY": "马来西亚", "TH": "泰国", "VN": "越南",
        "RU": "俄罗斯", "PH": "菲律宾"
    };
    if (c.toUpperCase().includes("CHINA")) return "中国";
    if (c.toUpperCase().includes("HONG KONG")) return "香港";
    if (c.toUpperCase().includes("TAIWAN")) return "台湾";
    if (c.toUpperCase().includes("MACAO")) return "澳门";
    if (c.toUpperCase().includes("JAPAN")) return "日本";
    if (c.toUpperCase().includes("KOREA")) return "韩国";
    if (c.toUpperCase().includes("SINGAPORE")) return "新加坡";
    if (c.toUpperCase().includes("UNITED STATES")) return "美国";
    return dict[c.toUpperCase()] || c;
}

// 域名预处理
async function resolveDomain(domain) {
    if (/^[0-9.]+$/.test(domain) || /:/.test(domain)) return domain; 
    try {
        let res = await httpGet({ url: `http://223.5.5.5/resolve?name=${domain}&type=A&short=1`, timeout: 3000 });
        let ips = JSON.parse(res);
        if (ips && ips.length > 0) return ips[0];
    } catch (e) {
        console.log("DNS 预解析失败，使用直连域名");
    }
    return domain;
}

function HIP(ip, isHide) {
    if (!ip || ip === "-") return "-";
    if (!isHide) return ip;
    return ip.replace(/(\w{1,4})(\.|\:)(\w{1,4}|\*)$/,(_, x, y, z) => `${"∗".repeat(x.length)}.${"∗".repeat(z.length)}`);
}

function getflag(countryCode) {
    if (!countryCode || countryCode === "-") return "";
    const code = countryCode.toUpperCase();
    if (code === "TW") return "🇨🇳"; 
    try {
        const flag = code.split("").map(c => 127397 + c.charCodeAt());
        return String.fromCodePoint(...flag);
    } catch (e) { return ""; }
}
