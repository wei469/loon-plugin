/**
 * 节点入口落地查询 - 究极全能融合版
 * 核心特性：
 * 1. 探针重构：借鉴最优解，直接利用海外接口侧解析域名，彻底规避本地 DNS 污染与 HTTP 阻断。
 * 2. 动态研判：加入“本机位置感知”，智能调整专线延迟红线，杜绝物理环境切换导致的误判。
 * 3. 冲突强杀：落地IP等于本机IP时，强制拦截并警告，阻断精神分裂式误判。
 * 4. 智能补偿：支持入口查询失败时的降级启发式推断。
 * 5. 全维汉化：深度定制 ISP 与位置翻译，呈现极致直观的段位 UI。
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const { node: nodeName, nodeInfo } = $environment.params;
        // 核心清洗 1：提取地址并暴力斩断端口号
        const cleanNodeAddr = nodeInfo.address.split(':')[0].trim();
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // --- 并发获取三维网络数据 ---
        // 核心清洗 2：直接将清洗后的地址/域名扔给接口，拒绝本地弱智 DNS 预解析
        let [local, landing, entrance] = await Promise.all([
            fetchInfo("", "DIRECT"),              // 本机裸奔环境
            fetchInfo("", nodeName),              // 落地伪装环境
            fetchInfo(cleanNodeAddr, "DIRECT")    // 入口探针环境
        ]);

        // --- 核心大脑：五维智能研判与冲突校正 ---
        let linkResult = "⟦ ❓ 未知状态 ⟧";
        
        // 护栏 1：防自欺欺人 (节点完全没起作用)
        if (!local.error && !landing.error && local.ip === landing.ip) {
            linkResult = "⟦ ⚠️ 节点未通 / 流量直连本机 ⟧";
        } 
        // 正常进入研判漏斗
        else if (!landing.error) {
            linkResult = analyzeLink(local, entrance, landing, nodeName);
        } else {
            linkResult = "⟦ ❌ 探测失败 / 节点离线 ⟧";
        }

        // --- 视觉 UI：三段式渲染与精准翻译 ---
        let localStr = local.error ? `🔴 本机查询失败<br>` : 
            `<b>本机:</b> ${getFlag(local.countryCode)} ${local.country} ${local.region} ${local.city}<br>` +
            `<b>ISP:</b> ${local.isp} (${HIP(local.ip, hideIP)})<br>`;
        
        let inStr = entrance.error ? `🟡 入口防探测隐蔽 / 解析跳过<br>` : 
            `<b>入口:</b> ${getFlag(entrance.countryCode)} ${entrance.country} ${entrance.region} ${entrance.city}<br>` +
            `<b>ISP:</b> ${entrance.isp} (${HIP(entrance.ip, hideIP)})<br>`;

        let outStr = landing.error ? `🔴 落地查询失败<br>` : 
            `<b>落地:</b> ${getFlag(landing.countryCode)} ${landing.country} ${landing.region} ${landing.city}<br>` +
            `<b>ISP:</b> ${landing.isp}<br>` +
            `<b>ASN:</b> ${landing.asn} (${landing.time}ms)<br>` +
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
        $done({ title: scriptName, htmlMessage: `<p style="text-align: center;"><br>探针核心故障:<br>${e.message}</p>` });
    }
})();

// ================= 🧠 最强大脑：智能研判引擎 =================
function analyzeLink(local, entrance, landing, nodeName) {
    const nameU = nodeName.toUpperCase();
    const outIP = landing.ip;
    const inIP = entrance.error ? null : entrance.ip;
    const lat = landing.time;
    const outC = landing.country.toUpperCase();
    const localC = local.error ? "CN" : local.countryCode.toUpperCase(); // 动态地理锚点

    // 1. 嗅探贵族血统 (ASN)
    const asnU = `${entrance.asn || ""} ${landing.asn || ""}`.toUpperCase();
    let premium = "";
    if (asnU.includes("4809")) premium = "CN2 GIA";
    else if (asnU.includes("9929")) premium = "联通 9929";
    else if (asnU.includes("58453")) premium = "移动 CMI";
    else if (asnU.includes("4134")) premium = "电信 163";

    // 2. 嗅探 CDN 伪装
    const isCDN = inIP && entrance.isp.toUpperCase().includes("CLOUDFLARE");

    // 3. 动态物理红线 (基于当前真实所处国家智能伸缩)
    let isLowLat = false;
    if (localC === "CN") {
        isLowLat = (/(香港|HK|澳门|MO)/.test(outC) && lat < 60) || (/(日本|JP|台湾|TW|韩国|KR)/.test(outC) && lat < 95) || (/(美国|US)/.test(outC) && lat < 210);
    } else if (localC === "TW" || localC === "JP") {
        // 在非大陆的高速宽带环境下，常规直连延迟本身就极低，专线阈值必须大幅收紧
        isLowLat = (/(香港|HK|台湾|TW|日本|JP)/.test(outC) && lat < 40) || (/(美国|US)/.test(outC) && lat < 150);
    } else {
        isLowLat = lat < 50; 
    }

    // 4. 商家承诺 (关键字)
    const isKw = /(IPLC|IEPL|专线|BGP|AIA|深港|沪日|莞港|京德)/.test(nameU);

    // --- 结论输出 ---
    // 降级推断模式 (无入口数据或纯CDN接入)
    if (!inIP || isCDN) {
        let prefix = isCDN ? "☁️ CDN接入 | " : "❓ 盲测 | ";
        if (isKw || isLowLat) return premium ? `⟦ ${prefix}🚀 疑似专线 | ${premium} ⟧` : `⟦ ${prefix}🚀 疑似物理专线 ⟧`;
        return premium ? `⟦ ${prefix}✈️ 疑似中转 | ${premium} ⟧` : `⟦ ${prefix}✈️ 常规中转 ⟧`;
    }

    // 精确打击模式 (入口落地双全)
    if (inIP === outIP) {
        return premium ? `⟦ 🚄 优化直连 | ${premium} ⟧` : `⟦ 🚙 常规直连网络 ⟧`;
    } else {
        if (isKw || isLowLat) return premium ? `⟦ 🚀 顶级专线 | ${premium} ⟧` : `⟦ 🚀 优质物理专线 ⟧`;
        return premium ? `⟦ ✈️ 跨境中转 | ${premium} ⟧` : `⟦ ✈️ 常规公网中转 ⟧`;
    }
}

// ================= 📡 不死探针：双擎主备查询 =================
function fetchInfo(queryParam, node) {
    const target = queryParam ? `/${queryParam}` : "";
    // 采用业内最稳的双接口，ip-api主攻(自带域名解析)，ip.sb兜底
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

            // 1.5秒极速断路器
            const timer = setTimeout(() => {
                hasTimedOut = true;
                handleNext();
            }, currentIndex === 0 ? 1500 : 3500);

            $httpClient.get({ 
                url: api.url, 
                node: node === "DIRECT" ? null : node,
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } // 伪装防屏蔽
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
            else reject(new Error("所有接口查询失败"));
        };

        doRequest();
    });
}

// ================= 📖 本地化字典与格式器 =================
function parseIpApi(d) {
    let j = JSON.parse(d);
    if (j.status !== "success") throw new Error("API返回失败");
    return { 
        ip: j.query, countryCode: j.countryCode, country: transCountry(j.country), 
        region: j.regionName || "", city: j.city || "", 
        isp: transISP(j.isp || j.org), asn: j.as ? j.as.split(" ")[0] : "-" 
    };
}

function parseIpSb(d) {
    let j = JSON.parse(d);
    return { 
        ip: j.ip, countryCode: j.country_code, country: transCountry(j.country), 
        region: j.region || "", city: j.city || "", 
        isp: transISP(j.isp || j.organization), asn: j.asn ? `AS${j.asn}` : "-" 
    };
}

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
    if (u.includes("AMAZON")||u.includes("AWS")) return "亚马逊云 (AWS)";
    if (u.includes("GOOGLE")||u.includes("GCP")) return "谷歌云 (GCP)";
    if (u.includes("MICROSOFT")||u.includes("AZURE")) return "微软云 (Azure)";
    if (u.includes("ALIBABA")||u.includes("ALIPAY")) return "阿里云";
    if (u.includes("TENCENT")) return "腾讯云";
    if (u.includes("NTT")) return "NTT";
    if (u.includes("KDDI")) return "KDDI";
    if (u.includes("SOFTBANK")) return "软银";
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
    if(code === "TW") return "🇨🇳"; // Emoji fallback
    try { return String.fromCodePoint(...code.split("").map(i=>127397+i.charCodeAt())); } catch (e) { return ""; }
}

