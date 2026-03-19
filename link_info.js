/**
 * 节点入口落地查询 - 终极融合优化版 (精准防错+入口汉化版)
 * 结合了稳定的查询引擎与优美的UI界面，支持 直连/中转/专线 智能判断
 * 仅支持 Loon - 在所有节点页面选择一个节点长按，出现菜单后进行测试
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params;
        const nodeName = inputParams.node;
        const nodeIp = inputParams.nodeInfo.address;
        
        // 读取隐藏IP配置
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // 严格按照顺序查询：先获取落地信息 (通过节点请求)
        let landingInfo = {};
        try {
            landingInfo = await getIPInfo("", nodeName);
        } catch (e) {
            landingInfo = { error: "LDFailed 落地查询超时或失败" };
        }

        // 严格按照顺序查询：再获取入口信息 (解析域名后直连请求)
        // 避免与落地请求并发导致 Loon 内部路由混乱，确保入口数据绝对准确
        let entranceInfo = {};
        try {
            let entranceIp = await resolveDomain(nodeIp);
            entranceInfo = await getIPInfo(entranceIp, null);
        } catch (e) {
            entranceInfo = { error: "INFailed 入口查询超时或失败" };
        }

        // 链路类型判断逻辑
        let cfw = "⟦ 未知状态 ⟧";
        if (!entranceInfo.error && !landingInfo.error) {
            if (entranceInfo.ip === landingInfo.ip) {
                cfw = "⟦ 直连线路 ⟧";
            } else {
                const nameUpper = nodeName.toUpperCase();
                if (/(IPLC|IEPL|专线|BGP|AIA)/.test(nameUpper)) {
                    cfw = "⟦ 优质专线 ⟧";
                } else {
                    cfw = "⟦ 常规中转 ⟧";
                }
            }
        } else {
            cfw = "⟦ 网络检测失败 ⟧";
        }

        // 组装入口 UI 文本 (仅对入口 ISP 进行汉化映射)
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

        // 组装落地 UI 文本 (保持原始英文 ISP)
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

        // 最终 HTML 渲染
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
            htmlMessage: `<p style="text-align: center;"><br>脚本执行发生了意外错误:<br>${error.message}</p>`
        });
    }
})();

// ================= 工具函数 =================

// ISP 汉化映射函数 (极速本地替换)
function translateISP(isp) {
    if (!isp) return "";
    const lowerISP = isp.toLowerCase();
    if (lowerISP.includes("chinanet") || lowerISP.includes("telecom")) return "中国电信";
    if (lowerISP.includes("unicom")) return "中国联通";
    if (lowerISP.includes("mobile")) return "中国移动";
    if (lowerISP.includes("broadcasting") || lowerISP.includes("cbn")) return "中国广电";
    if (lowerISP.includes("alibaba") || lowerISP.includes("alipay")) return "阿里云";
    if (lowerISP.includes("tencent")) return "腾讯云";
    return isp; // 如果没有匹配上，原样返回英文
}

// HTTP GET 封装
function httpGet(opts) {
    return new Promise((resolve, reject) => {
        $httpClient.get(opts, (err, resp, data) => {
            if (err) return reject(err);
            if (resp.status !== 200) return reject(new Error(`HTTP Error: ${resp.status}`));
            resolve(data);
        });
    });
}

// 核心 IP 查询逻辑 (带备用接口防超时)
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
            
            // 简单清洗数据，防止出现 undefined
            for(let key in info) { if(!info[key]) info[key] = "-"; }
            return info;
        } catch (e) {
            console.log(`查询接口失败: ${api.url}, 尝试下一个...`);
            continue;
        }
    }
    throw new Error("所有IP查询接口均超时或受限");
}

// 解析 ip-api 数据格式 (增加兜底防止 replace 报错)
function parseIpApi(data) {
    let json = JSON.parse(data);
    if (json.status !== 'success') throw new Error("API返回异常");
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

// 解析 ip.sb 数据格式 (增加兜底)
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

// 域名解析 (如果节点地址是域名，需先解析出入口IP)
async function resolveDomain(domain) {
    if (/^[0-9.]+$/.test(domain) || /:/.test(domain)) return domain; // 如果已经是 IP 则直接返回
    try {
        let res = await httpGet({ url: `https://223.5.5.5/resolve?name=${domain}&type=A&short=1`, timeout: 3000 });
        let ips = JSON.parse(res);
        if (ips && Array.isArray(ips) && ips.length > 0) return ips[0];
    } catch (e) {
        console.log("AliDNS 解析失败，直接使用原地址进行查询");
    }
    return domain;
}

// 隐藏 IP 函数
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
