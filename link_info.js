/**
 * 节点入口落地查询 - 终极融合优化版 (提速+防崩版)
 * 结合了稳定的查询引擎与优美的UI界面，支持 直连/中转/专线 智能判断
 * 仅支持 Loon - 在所有节点页面选择一个节点长按，出现菜单后进行测试
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params || {};
        const nodeName = inputParams.node || "未知节点";
        const nodeInfo = inputParams.nodeInfo || {};
        const nodeAddress = nodeInfo.address || "";
        
        // 读取隐藏IP配置
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        let landingInfo = {};
        let entranceInfo = {};

        // 🚀 优化点 1：使用 Promise.all 并发请求，大幅缩短查询时间
        await Promise.all([
            // 任务 A: 获取落地信息 (通过节点代理请求)
            (async () => {
                try {
                    landingInfo = await getIPInfo("", nodeName);
                } catch (e) {
                    landingInfo = { error: "LDFailed 落地查询超时或失败" };
                }
            })(),
            
            // 任务 B: 获取入口信息 (解析域名后直连请求)
            (async () => {
                try {
                    if (!nodeAddress) throw new Error("无节点地址");
                    let entranceIp = await resolveDomain(nodeAddress);
                    entranceInfo = await getIPInfo(entranceIp, null);
                } catch (e) {
                    entranceInfo = { error: "INFailed 入口查询超时或失败" };
                }
            })()
        ]);

        // 链路类型判断逻辑
        let cfw = "⟦ 未知状态 ⟧";
        if (!entranceInfo.error && !landingInfo.error) {
            if (entranceInfo.ip === landingInfo.ip) {
                cfw = "⟦ 直连线路 ⟧";
            } else {
                // 结合节点名称判断是否为专线
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

        // 组装入口 UI 文本
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

        // 组装落地 UI 文本
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

// 核心 IP 查询逻辑
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
            
            for(let key in info) { if(!info[key]) info[key] = "-"; }
            return info;
        } catch (e) {
            console.log(`查询接口失败: ${api.url}, 尝试下一个...`);
            continue;
        }
    }
    throw new Error("所有IP查询接口均超时或受限");
}

// 🚀 优化点 2：增加默认值和容错处理，防止接口返回不规范导致 replace 崩溃
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

// 域名解析
async function resolveDomain(domain) {
    if (/^[0-9.]+$/.test(domain) || /:/.test(domain)) return domain; 
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
