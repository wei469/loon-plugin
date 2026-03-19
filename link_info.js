/**
 * 节点入口落地查询 - 终极零维护汉化版
 * 特性：三级接口兜底防超时 + ISP及地区全中文翻译 + 直连/中转/专线智能识别
 * 适用：仅支持 Loon - 在所有节点页面选择一个节点长按，出现菜单后进行测试
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params;
        const nodeName = inputParams.node;
        const nodeIp = inputParams.nodeInfo.address;
        
        // 读取隐藏IP配置 (如果在Loon插件中设置了该项)
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // 1. 获取落地信息 (通过当前代理节点发出请求，不带IP参数，查的是落地IP)
        let landingInfo = {};
        try {
            landingInfo = await getIPInfo("", nodeName);
        } catch (e) {
            landingInfo = { error: "LDFailed 落地节点查询全部超时或失败" };
        }

        // 2. 获取入口信息 (通过解析节点地址，直接查询该入口IP的信息)
        let entranceInfo = {};
        try {
            let entranceIp = await resolveDomain(nodeIp);
            entranceInfo = await getIPInfo(entranceIp, null);
        } catch (e) {
            entranceInfo = { error: "INFailed 入口服务器查询全部超时或失败" };
        }

        // 3. 智能链路类型判断逻辑
        let cfw = "⟦ 未知状态 ⟧";
        if (!entranceInfo.error && !landingInfo.error) {
            if (entranceInfo.ip === landingInfo.ip) {
                cfw = "⟦ 直连线路 ⟧";
            } else {
                // 结合节点名称关键字判断是否为专线
                const nameUpper = nodeName.toUpperCase();
                if (/(IPLC|IEPL|专线|BGP|AIA|深港|沪日)/.test(nameUpper)) {
                    cfw = "⟦ 优质专线 ⟧";
                } else {
                    cfw = "⟦ 常规中转 ⟧";
                }
            }
        } else {
            cfw = "⟦ 网络检测失败 ⟧";
        }

        // 4. 组装入口 UI 文本
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

        // 5. 组装落地 UI 文本
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

        // 6. 最终 HTML 渲染 (保留了你最喜欢的排版样式)
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
        $done({
            title: scriptName,
            htmlMessage: `<p style="text-align: center;"><br>脚本执行发生意外错误:<br>${error.message}</p>`
        });
    }
})();

// ================= 核心工具与接口函数 =================

// HTTP GET 请求封装
function httpGet(opts) {
    return new Promise((resolve, reject) => {
        $httpClient.get(opts, (err, resp, data) => {
            if (err) return reject(err);
            if (resp.status !== 200) return reject(new Error(`HTTP Error: ${resp.status}`));
            resolve(data);
        });
    });
}

// 核心 IP 查询逻辑：三级接口防超时 (主力 -> 备用 -> 兜底)
async function getIPInfo(ip, nodeName = null) {
    const targetIp = ip ? `/${ip}` : "";
    
    // 部署三道接口防线
    const apis = [
        { url: `http://ip-api.com/json${targetIp}?lang=zh-CN`, parser: parseIpApi },
        { url: `https://api-ipv4.ip.sb/geoip${targetIp}`, parser: parseIpSb },
        { url: `https://ipinfo.io${targetIp}/json`, parser: parseIpInfo }
    ];

    for (let api of apis) {
        try {
            let start = Date.now();
            let opts = { url: api.url, timeout: 5000 };
            if (nodeName) opts.node = nodeName; // 如果有节点名，则通过该节点代理查询

            let res = await httpGet(opts);
            let info = api.parser(res);
            info.time = Date.now() - start;
            
            // 数据清洗：把所有空的字段替换为 "-"
            for(let key in info) { if(!info[key]) info[key] = "-"; }
            return info;
        } catch (e) {
            console.log(`[接口切换] ${api.url} 查询失败，尝试下一个...`);
            continue; // 当前接口失败，无缝切换下一个
        }
    }
    throw new Error("所有IP查询接口均超时或受限");
}

// ================= 数据解析器 =================

// 解析 主力：ip-api 数据格式
function parseIpApi(data) {
    let json = JSON.parse(data);
    if (json.status !== 'success') throw new Error("API返回异常");
    return {
        ip: json.query,
        country: json.country.replace(/中国\s*/, ''),
        countryCode: json.countryCode,
        region: json.regionName,
        city: json.city,
        isp: translateISP(json.isp || json.org || json.as),
        asn: json.as ? json.as.split(" ")[0] : ""
    };
}

// 解析 备用：ip.sb 数据格式
function parseIpSb(data) {
    let json = JSON.parse(data);
    return {
        ip: json.ip,
        country: translateCountry(json.country),
        countryCode: json.country_code,
        region: json.region,
        city: json.city,
        isp: translateISP(json.isp || json.organization),
        asn: json.asn ? `AS${json.asn}` : ''
    };
}

// 解析 兜底：ipinfo.io 数据格式
function parseIpInfo(data) {
    let json = JSON.parse(data);
    if (json.bogon) throw new Error("内网或保留IP");
    return {
        ip: json.ip,
        country: translateCountry(json.country), 
        countryCode: json.country,
        region: json.region,
        city: json.city,
        isp: translateISP(json.org), // ipinfo 通常把 ASN 和 运营商合在 org 字段
        asn: json.org ? json.org.split(" ")[0] : ""
    };
}

// ================= 智能汉化字典 =================

// ISP 运营商全链路中文翻译
function translateISP(isp) {
    if (!isp) return "-";
    let upper = isp.toUpperCase();
    
    // 国内运营商
    if (upper.includes("CHINANET") || upper.includes("CHINATELECOM") || upper.includes("TELECOM")) return "中国电信";
    if (upper.includes("UNICOM")) return "中国联通";
    if (upper.includes("MOBILE")) return "中国移动";
    if (upper.includes("BROADCASTING") || upper.includes("CBN")) return "中国广电";
    if (upper.includes("CERNET")) return "教育网";
    
    // 国内云大厂
    if (upper.includes("TENCENT")) return "腾讯云";
    if (upper.includes("ALIBABA") || upper.includes("ALIPAY") || upper.includes("TAOBAO")) return "阿里云";
    if (upper.includes("HUAWEI")) return "华为云";
    if (upper.includes("BAIDU")) return "百度云";
    
    // 港澳台及海外知名运营商/云大厂
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
    if (upper.includes("STARLINK")) return "星链 (Starlink)";
    
    return isp; // 未匹配到则保持原样
}

// 兜底接口的国家中文翻译
function translateCountry(c) {
    if (!c) return "";
    const dict = {
        "CN": "中国", "HK": "香港", "TW": "台湾", "MO": "澳门", "JP": "日本", "KR": "韩国",
        "SG": "新加坡", "US": "美国", "UK": "英国", "GB": "英国", "CA": "加拿大", "AU": "澳大利亚",
        "DE": "德国", "FR": "法国", "IN": "印度", "MY": "马来西亚", "TH": "泰国", "VN": "越南",
        "RU": "俄罗斯", "PH": "菲律宾"
    };
    return dict[c.toUpperCase()] || c;
}

// ================= 辅助函数 =================

// 域名解析 (节点地址如果是域名，需通过此函数拿到真实入口 IP)
async function resolveDomain(domain) {
    if (/^[0-9.]+$/.test(domain) || /:/.test(domain)) return domain; 
    try {
        let res = await httpGet({ url: `http://223.5.5.5/resolve?name=${domain}&type=A&short=1`, timeout: 3000 });
        let ips = JSON.parse(res);
        if (ips && ips.length > 0) return ips[0];
    } catch (e) {
        console.log("DNS 解析失败，使用原地址查询");
    }
    return domain;
}

// 隐藏 IP 函数 (脱敏保护)
function HIP(ip, isHide) {
    if (!ip) return "";
    if (!isHide) return ip;
    return ip.replace(/(\w{1,4})(\.|\:)(\w{1,4}|\*)$/,(_, x, y, z) => `${"∗".repeat(x.length)}.${"∗".repeat(z.length)}`);
}

// Emoji 国旗获取
function getflag(countryCode) {
    if (!countryCode) return "";
    const code = countryCode.toUpperCase();
    if (code === "TW") return "🇨🇳"; 
    const flag = code.split("").map(c => 127397 + c.charCodeAt());
    return String.fromCodePoint(...flag);
}
