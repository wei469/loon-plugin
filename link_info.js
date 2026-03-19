/**
 * 节点入口落地查询 - 双接口极速赛马版
 * 特性：剔除冗余接口 + 极限 3 秒防卡死 + 四维链路研判 + 专属段位图标
 * 适用：仅支持 Loon
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params;
        const nodeName = inputParams.node;
        const nodeIp = inputParams.nodeInfo.address;
        
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // 1. 获取本机信息 (直连请求)
        let localInfo = {};
        try {
            localInfo = await fetchFastest("", "DIRECT");
        } catch (e) {
            localInfo = { error: "LocalFailed 本机查询超时" };
        }

        // 2. 获取落地信息 (通过节点请求)
        let landingInfo = {};
        try {
            landingInfo = await fetchFastest("", nodeName);
        } catch (e) {
            landingInfo = { error: "LDFailed 落地查询超时" };
        }

        // 3. 获取入口信息 (直连请求节点的真实入口)
        let entranceInfo = {};
        try {
            let entranceIp = await resolveDomain(nodeIp);
            entranceInfo = await fetchFastest(entranceIp, "DIRECT");
        } catch (e) {
            entranceInfo = { error: "INFailed 入口查询超时" };
        }

        // 4. 核心链路研判
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

        // 5. 组装 本机 UI
        let localStr = "";
        if (localInfo.error) {
            localStr = `${localInfo.error}<br><br>`;
        } else {
            localStr = `<b><font>本机 IP</font>:</b> <font>${HIP(localInfo.ip, hideIP)}</font><br>
        <b><font>本机位置</font>:</b> <font>${getflag(localInfo.countryCode)} ${localInfo.country} ${localInfo.region} ${localInfo.city}</font><br>
        <b><font>本机 ISP</font>:</b> <font>${localInfo.isp}</font><br><br>`;
        }

        // 6. 组装 入口 UI
        let ins = "";
        if (entranceInfo.error) {
            ins = `${entranceInfo.error}<br><br>`;
        } else {
            ins = `<b><font>入口 IP</font>:</b> <font>${HIP(entranceInfo.ip, hideIP)}</font><br>
        <b><font>入口位置</font>:</b> <font>${getflag(entranceInfo.countryCode)} ${entranceInfo.country} ${entranceInfo.region} ${entranceInfo.city}</font><br>
        <b><font>入口 ISP</font>:</b> <font>${entranceInfo.isp}</font><br><br>`;
        }

        // 7. 组装 落地 UI
        let outs = "";
        if (landingInfo.error) {
            outs = `${landingInfo.error}<br><br>`;
        } else {
            outs = `<b><font>落地 IP</font>:</b> <font>${HIP(landingInfo.ip, hideIP)}</font><br>
        <b><font>落地位置</font>:</b> <font>${getflag(landingInfo.countryCode)} ${landingInfo.country} ${landingInfo.region} ${landingInfo.city}</font><br>
        <b><font>落地 ISP</font>:</b> <font>${landingInfo.isp}</font><br>
        <b><font>落地 ASN</font>:</b> <font>${landingInfo.asn} (${landingInfo.time}ms)</font><br>`;
        }

        // 8. 最终渲染
        let message = `<p 
    style="text-align: center; 
    font-family: -apple-system; 
    font-size: large; 
    font-weight: thin">
    <br>-------------------------------<br><br>
    ${localStr}
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
        $done({ title: scriptName, htmlMessage: `<p style="text-align: center;"><br>执行错误:<br>${error.message}</p>` });
    }
})();

// ================= 极速双路赛马请求机制 =================
function fetchFastest(ip, nodeName = null) {
    return new Promise((resolve, reject) => {
        const targetIp = ip ? `/${ip}` : "";
        // 砍掉多余接口，仅保留两大最稳主力
        const apis = [
            { url: `http://ip-api.com/json${targetIp}?lang=zh-CN`, parser: parseIpApi },
            { url: `https://api-ipv4.ip.sb/geoip${targetIp}`, parser: parseIpSb }
        ];
        
        let errors = 0;
        let resolved = false;

        apis.forEach(api => {
            let start = Date.now();
            // 极限压缩超时时间，3秒不出结果直接杀掉，防止卡顿
            let opts = { url: api.url, timeout: 3000 }; 
            if (nodeName) opts.node = nodeName;

            $httpClient.get(opts, (err, resp, data) => {
                if (resolved) return; 
                if (!err && resp.status === 200) {
                    try {
                        let info = api.parser(data);
                        info.time = Date.now() - start;
                        for(let key in info) { if(!info[key]) info[key] = "-"; }
                        resolved = true;
                        resolve(info); 
                    } catch(e) {
                        errors++;
                        if (errors === apis.length) reject(new Error("解析失败"));
                    }
                } else {
                    errors++;
                    if (errors === apis.length) reject(new Error("请求超时"));
                }
            });
        });
    });
}

// ================= 智能链路研判 =================
function judgeLinkType(inIP, outIP, inASN, outASN, latency, outCountry, nodeName) {
    let isDirect = (inIP === outIP);
    let asnStr = `${inASN} ${outASN}`.toUpperCase();
    let nameStr = nodeName.toUpperCase();
    
    let premiumRoute = "";
    if (asnStr.includes("4809")) premiumRoute = "CN2 GIA";
    else if (asnStr.includes("9929")) premiumRoute = "联通 9929";
    else if (asnStr.includes("58453")) premiumRoute = "移动 CMI";
    else if (asnStr.includes("4134")) premiumRoute = "电信 163";

    let isLowLatency = false;
    let cty = outCountry.toUpperCase();
    if ((cty.includes("香港") || cty.includes("HK")) && latency < 65) isLowLatency = true;
    else if ((cty.includes("日本") || cty.includes("JP") || cty.includes("台湾") || cty.includes("TW")) && latency < 100) isLowLatency = true;
    else if ((cty.includes("新加坡") || cty.includes("SG")) && latency < 110) isLowLatency = true;
    else if ((cty.includes("美国") || cty.includes("US")) && latency < 210) isLowLatency = true;

    let isKeywordIPLC = /(IPLC|IEPL|专线|BGP|AIA|深港|沪日|莞港|京德)/.test(nameStr);

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

// ================= 数据清洗与中文翻译器 =================
function parseIpApi(data) {
    let json = JSON.parse(data);
    if (json.status !== 'success') throw new Error("API异常");
    return {
        ip: json.query, country: translateCountry(json.country), countryCode: json.countryCode,
        region: json.regionName, city: json.city, isp: translateISP(json.isp || json.org || json.as),
        asn: json.as ? json.as.split(" ")[0] : "-"
    };
}

function parseIpSb(data) {
    let json = JSON.parse(data);
    return {
        ip: json.ip, country: translateCountry(json.country), countryCode: json.country_code,
        region: json.region, city: json.city, isp: translateISP(json.isp || json.organization),
        asn: json.asn ? `AS${json.asn}` : "-"
    };
}

function translateISP(isp) {
    if (!isp) return "-";
    let upper = isp.toUpperCase();
    if (upper.includes("CHINANET") || upper.includes("TELECOM")) return "中国电信";
    if (upper.includes("UNICOM")) return "中国联通";
    if (upper.includes("MOBILE")) return "中国移动";
    if (upper.includes("BROADCASTING") || upper.includes("CBN")) return "中国广电";
    if (upper.includes("TENCENT")) return "腾讯云";
    if (upper.includes("ALIBABA") || upper.includes("ALIPAY") || upper.includes("TAOBAO")) return "阿里云";
    if (upper.includes("HUAWEI")) return "华为云";
    if (upper.includes("HKBN")) return "香港宽频 (HKBN)";
    if (upper.includes("PCCW") || upper.includes("HKT")) return "电讯盈科 (PCCW)";
    if (upper.includes("HINET") || upper.includes("CHUNGHWA")) return "中华电信 (HiNet)";
    if (upper.includes("AMAZON") || upper.includes("AWS")) return "亚马逊云 (AWS)";
    if (upper.includes("MICROSOFT") || upper.includes("AZURE")) return "微软云 (Azure)";
    if (upper.includes("GOOGLE") || upper.includes("GCP")) return "谷歌云 (GCP)";
    if (upper.includes("CLOUDFLARE")) return "Cloudflare";
    if (upper.includes("KDD") || upper.includes("KDDI")) return "KDDI";
    if (upper.includes("SOFTBANK")) return "软银 (SoftBank)";
    if (upper.includes("NTT")) return "NTT";
    return isp;
}

function translateCountry(c) {
    if (!c) return "-";
    let dict = { "CN": "中国", "HK": "香港", "TW": "台湾", "MO": "澳门", "JP": "日本", "KR": "韩国", "SG": "新加坡", "US": "美国", "UK": "英国", "GB": "英国", "CA": "加拿大", "AU": "澳大利亚", "DE": "德国", "FR": "法国" };
    if (c.toUpperCase().includes("CHINA")) return "中国";
    if (c.toUpperCase().includes("HONG KONG")) return "香港";
    if (c.toUpperCase().includes("TAIWAN")) return "台湾";
    if (c.toUpperCase().includes("JAPAN")) return "日本";
    if (c.toUpperCase().includes("SINGAPORE")) return "新加坡";
    if (c.toUpperCase().includes("UNITED STATES")) return "美国";
    return dict[c.toUpperCase()] || c;
}

async function resolveDomain(domain) {
    if (/^[0-9.]+$/.test(domain) || /:/.test(domain)) return domain; 
    try {
        let res = await new Promise((resolve, reject) => {
            $httpClient.get({ url: `http://223.5.5.5/resolve?name=${domain}&type=A&short=1`, timeout: 2000 }, (err, resp, data) => {
                if(err) reject(err); else resolve(data);
            });
        });
        let ips = JSON.parse(res);
        if (ips && ips.length > 0) return ips[0];
    } catch (e) { }
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
    try { return String.fromCodePoint(...code.split("").map(c => 127397 + c.charCodeAt())); } catch (e) { return ""; }
}
