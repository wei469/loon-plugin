/**
 * 节点入口落地查询 - 逻辑严研版
 * 特性：数据强清洗 + 链路冲突校正 + 极速双路并发
 * 修正：解决了落地IP显示本机IP导致研判冲突的逻辑Bug
 */

const scriptName = "入口落地查询";

(async () => {
    try {
        const loonInfo = typeof $loon !== "undefined" ? $loon.split(" ") : ["Loon", "Unknown", ""];
        const inputParams = $environment.params;
        const nodeName = inputParams.node;
        const nodeIpRaw = inputParams.nodeInfo.address;
        
        // 1. 数据强清洗：去除可能存在的端口号和空格
        const cleanNodeIp = nodeIpRaw.split(':')[0].trim();
        const hideIP = $persistentStore.read("是否隐藏真实IP") === "隐藏";

        // 2. 并发赛马获取三端数据
        let [local, landing, entrance] = await Promise.all([
            fetchFastest("", "DIRECT"), // 本机
            fetchFastest("", nodeName), // 落地
            resolveDomain(cleanNodeIp).then(ip => fetchFastest(ip, "DIRECT")) // 入口
        ]).catch(e => [ {error: "查询失败"}, {error: "查询失败"}, {error: "查询失败"} ]);

        // 3. 冲突校正逻辑：防止落地显示本机导致研判混乱
        let cfw = "⟦ ❓ 未知状态 ⟧";
        if (!entrance.error && !landing.error && !local.error) {
            // 如果落地IP竟然等于本机IP，说明节点根本没通，强制修正
            if (landing.ip === local.ip) {
                cfw = "⟦ ⚠️ 节点未通/直连 ⟧";
            } else {
                cfw = judgeLinkType(entrance.ip, landing.ip, entrance.asn, landing.asn, landing.time, landing.country, nodeName);
            }
        } else {
            cfw = "⟦ ❌ 探测超时 ⟧";
        }

        // UI 组装
        let localStr = local.error ? `${local.error}<br>` : `<b>本机:</b> ${getflag(local.countryCode)} ${local.country} ${local.isp} (${HIP(local.ip, hideIP)})<br>`;
        let inStr = entrance.error ? `${entrance.error}<br>` : `<b>入口:</b> ${getflag(entrance.countryCode)} ${entrance.country} ${entrance.isp} (${HIP(entrance.ip, hideIP)})<br>`;
        let outStr = landing.error ? `${landing.error}<br>` : `<b>落地:</b> ${getflag(landing.countryCode)} ${landing.country} ${landing.isp}<br><b>ASN:</b> ${landing.asn} (${landing.time}ms)<br><b>IP:</b> ${HIP(landing.ip, hideIP)}<br>`;

        let message = `<p style="text-align: center; font-family: -apple-system; font-size: large; font-weight: thin"><br>-------------------------------<br><br>${localStr}<br>${inStr}-------------------<br><b><font color="#467fcf">${cfw}</font></b><br>-------------------<br><br>${outStr}<br>-------------------------------<br><br><b>节点</b> ➟ ${nodeName}<br><b>设备</b> ➟ ${loonInfo[1]} ${loonInfo[2]||""}</p>`;

        $done({ title: scriptName, htmlMessage: message });
    } catch (e) {
        $done({ title: scriptName, htmlMessage: "脚本运行崩溃: " + e });
    }
})();

async function fetchFastest(ip, node) {
    const target = ip ? `/${ip}` : "";
    const apis = [
        { url: `http://ip-api.com/json${target}?lang=zh-CN`, p: parseIpApi },
        { url: `https://api-ipv4.ip.sb/geoip${target}`, p: parseIpSb }
    ];
    return new Promise((res) => {
        let count = 0, finished = false;
        apis.forEach(api => {
            let start = Date.now();
            $httpClient.get({ url: api.url, timeout: 3000, node: node === "DIRECT" ? null : node }, (err, resp, data) => {
                if (finished) return;
                if (!err && resp.status === 200) {
                    finished = true;
                    let info = api.p(data);
                    info.time = Date.now() - start;
                    res(info);
                } else {
                    if (++count === apis.length) res({ error: "查询超时" });
                }
            });
        });
    });
}

function judgeLinkType(inIP, outIP, inASN, outASN, lat, outC, name) {
    let nameU = name.toUpperCase(), asnU = `${inASN}${outASN}`, isDirect = inIP === outIP;
    let premium = "";
    if (asnU.includes("4809")) premium = "CN2 GIA";
    else if (asnU.includes("9929")) premium = "联通 9929";
    else if (asnU.includes("58453")) premium = "移动 CMI";
    else if (asnU.includes("4134")) premium = "电信 163";

    let isLowLat = (/(香港|HK)/.test(outC) && lat < 60) || (/(日本|JP|台湾|TW)/.test(outC) && lat < 90) || (/(美国|US)/.test(outC) && lat < 200);
    let isKw = /(IPLC|IEPL|专线|BGP|AIA|深港|沪日)/.test(nameU);

    if (isDirect) return premium ? `⟦ 🚄 准直连 | ${premium} ⟧` : `⟦ 🚙 准直连 ⟧`;
    if (isKw || isLowLat) return premium ? `⟦ 🚀 顶级专线 | ${premium} ⟧` : `⟦ 🚀 物理专线 ⟧`;
    return premium ? `⟦ ✈️ 优化中转 | ${premium} ⟧` : `⟦ ✈️ 常规中转 ⟧`;
}

function parseIpApi(d) {
    let j = JSON.parse(d);
    return { ip: j.query, country: j.country, countryCode: j.countryCode, region: j.regionName, city: j.city, isp: transISP(j.isp||j.org), asn: j.as?j.as.split(" ")[0]:"-" };
}
function parseIpSb(d) {
    let j = JSON.parse(d);
    return { ip: j.ip, country: transCountry(j.country), countryCode: j.country_code, region: j.region, city: j.city, isp: transISP(j.isp||j.organization), asn: j.asn?`AS${j.asn}`:"-" };
}
function transISP(i) {
    let u = i.toUpperCase();
    if (u.includes("CHINANET")||u.includes("TELECOM")) return "中国电信";
    if (u.includes("UNICOM")) return "中国联通";
    if (u.includes("MOBILE")) return "中国移动";
    if (u.includes("PCCW")||u.includes("HKT")) return "电讯盈科";
    if (u.includes("HINET")) return "中华电信";
    return i;
}
function transCountry(c) {
    let d = {"CN":"中国","HK":"香港","TW":"台湾","JP":"日本","US":"美国","SG":"新加坡"};
    return d[c.toUpperCase()] || c;
}
async function resolveDomain(d) {
    if (/^[0-9.]+$/.test(d)) return d;
    try {
        let res = await new Promise(r => $httpClient.get({url:`http://223.5.5.5/resolve?name=${d}&type=A&short=1`,timeout:2000}, (e,s,body) => r(body)));
        return JSON.parse(res)[0] || d;
    } catch(e) { return d; }
}
function HIP(ip, h) { return (h && ip !== "-") ? ip.replace(/(\w{1,4})(\.|\:)(\w{1,4}|\*)$/,(_,x,y,z)=>`∗∗.∗∗`) : ip; }
function getflag(c) { 
    if(!c||c==="-") return "";
    if(c.toUpperCase()==="TW") return "🇨🇳";
    return String.fromCodePoint(...c.toUpperCase().split("").map(i=>127397+i.charCodeAt()));
}
