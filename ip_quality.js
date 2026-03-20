/*
 * 整合版 IP 信息查询脚本 (主备双引擎 - 纯原生请求版 + 数据源提示)
 */

const titleText = "网络质量 𝕏";
const urlMain = "https://my.123169.xyz/v1/info";    // 主接口
const urlBackup = "https://my.ippure.com/v1/info";  // 备用接口

// 回归最原生、最稳定的请求封装，不加任何干扰底层生命周期的 JS 计时器
async function request(method, params) {
  return new Promise((resolve) => {
    const httpMethod = $httpClient[method.toLowerCase()];
    httpMethod(params, (error, response, data) => {
      resolve({ error, response, data });
    });
  });
}

// 深度汉化字典
function translate(text) {
  if (!text) return "";
  const dict = {
    "United States": "美国", "Japan": "日本", "Taiwan": "台湾", "Hong Kong": "香港", 
    "Singapore": "新加坡", "United Kingdom": "英国", "Korea": "韩国", "China": "中国",
    "Malaysia": "马来西亚", "Germany": "德国", "France": "法国", "Australia": "澳大利亚",
    "Tokyo": "东京", "Osaka": "大阪", "Taipei": "台北", "New Taipei": "新北",
    "Los Angeles": "洛杉矶", "San Jose": "圣何塞", "New York": "纽约", "Seattle": "西雅图",
    "Seoul": "首尔", "London": "伦敦", "Frankfurt": "法兰克福", "Sydney": "悉尼",
    "Chunghwa Telecom": "中华电信", "HiNet": "中华电信", "Chief Telecom": "是方电讯",
    "Amazon": "亚马逊", "Amazon.com": "亚马逊 (AWS)", "Google": "谷歌 (GCP)",
    "Microsoft": "微软 (Azure)", "Cloudflare": "Cloudflare", "Alibaba": "阿里云",
    "Tencent": "腾讯云", "Oracle": "甲骨文", "DigitalOcean": "DigitalOcean",
    "Linode": "Linode", "Akamai": "Akamai", "Vultr": "Vultr", "Hetzner": "Hetzner",
    "OVH": "OVH", "Starlink": "星链", "PCCW": "电讯盈科", "HKT": "香港电讯",
    "HKBN": "香港宽频", "CMHK": "中国移动香港", "CHT": "中华电信",
    "KDDI": "KDDI", "SoftBank": "软银", "NTT": "NTT", "IIJ": "IIJ",
    "SingTel": "新电信", "StarHub": "星和电信"
  };

  let result = text;
  for (const [en, zh] of Object.entries(dict)) {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    result = result.replace(regex, zh);
  }
  for (const [en, zh] of Object.entries(dict)) {
    if (result.toLowerCase().includes(en.toLowerCase())) {
        const regex = new RegExp(en, 'gi');
        result = result.replace(regex, zh);
    }
  }
  return result;
}

function getFlagEmoji(code) {
  if (!code) return "🌍";
  const c = String(code).toUpperCase();
  if (c === "TW") return `<img src="https://he2o.vercel.app/Resource/Icon/Emoji.png" style="width:1.3em;height:1.3em;">`;
  if (c.length !== 2) return "";
  return String.fromCodePoint(...c.split("").map(ch => 127397 + ch.charCodeAt(0))) + " ";
}

function getScoreLevel(score) {
  if (score === "N/A" || score === null || score === undefined) return { text: "暂无风险(仅供参考)", color: "#000" };
  const s = Number(score);
  if (s >= 0 && s <= 15) return { text: "极度纯净 🟢", color: "#12512a" };
  if (s >= 16 && s <= 25) return { text: "纯净 ✅", color: "#1b9e4b" };
  if (s >= 26 && s <= 40) return { text: "中性 🟩", color: "#6aa312" };
  if (s >= 41 && s <= 50) return { text: "轻度风险 🟡", color: "#bb8f06" };
  if (s >= 51 && s <= 70) return { text: "中度风险 🟠", color: "#be5105" };
  if (s >= 71 && s <= 100) return { text: "极度风险 🔴", color: "#ae1c1c" };
  return { text: "暂无风险(仅供参考)", color: "#000" };
}

async function main() {
  const nodeName = $environment.params?.node;
  let dataSource = "主接口"; // 初始化数据源标记
  
  const reqParams = { url: urlMain };
  if (nodeName) reqParams.node = nodeName;

  // 1. 纯原生请求主接口
  let { error, response, data } = await request("GET", reqParams);

  // 2. 原生请求明确失败后，平滑切换备用接口，并修改数据源标记
  if (error || !data) {
    dataSource = "备用接口";
    reqParams.url = urlBackup;
    const backupRes = await request("GET", reqParams);
    error = backupRes.error;
    response = backupRes.response;
    data = backupRes.data;
  }

  if (error || !data) {
    return $done({ title: titleText, htmlMessage: "<b>网络请求失败</b>" });
  }

  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return $done({ title: titleText, htmlMessage: "<b>JSON 数据无效</b>" });
  }

  const ip = json.ipAddress || json.query || json.ip || "未知";
  const isp = translate(json.asOrganization) || "未知";
  const asn = json.asNumber || json.asn || (json.as && json.as.replace(/[^0-9]/g, "")) || "未知";
  const flag = getFlagEmoji(json.countryCode);
  
  const rawLoc = [...new Set([json.country, json.region, json.city].filter(Boolean))].join(", ");
  const loc = (flag ? flag : "") + (translate(rawLoc) || "未知");

  const score = json.fraudScore;
  const level = getScoreLevel(score);
  const scoreHtml = (score === null || score === undefined || score === "N/A")
    ? `<span style="color:#000;">暂无风险(仅供参考)</span>`
    : score > 0
      ? `<span style="color:${level.color};">${score}% ${level.text}</span>`
      : `<span style="color:${level.color};">${level.text}</span>`;

  // 非黑即白的严格布尔值判定
  const isRes = (json.isResidential === true || json.isResidential === "true");
  const isBrd = (json.isBroadcast === true || json.isBroadcast === "true");
  
  const typeText = isRes ? "🏠 住宅网络" : "🏢 数据中心";
  const brdText = isBrd ? "📡 广播" : "🌐 原生";
  const typeColor = isRes ? "#12512a" : "#6aa312";
  const brdColor = isBrd ? "#bb8f06" : "#12512a";
  const htmlType = `<span style="color:${typeColor};">${typeText}</span> • <span style="color:${brdColor};">${brdText}</span>`;

  const html = `
<div style="margin:0;padding:0;font-family:-apple-system;font-size:large;">

<b>IP:</b> ${ip}<br><br>
<b>位置:</b> ${loc}<br><br>
<b>ISP:</b> ${isp}<br><br>
<b>ASN:</b> ${asn}<br><br>
<b>属性:</b> ${htmlType}<br><br>
<b>系数:</b> ${scoreHtml}<br><br>

<div>
<b>节点</b> ➟ <span style="color:${level.color};">${nodeName ?? "未知节点"}</span>
<span style="font-size:13px; color:#888; float:right; margin-top:2px;">(${dataSource})</span>
</div>

</div>
`.trim();

  return $done({ title: titleText, htmlMessage: html });
}

(async () => {
  try {
    await main();
  } catch (e) {
    $done({ title: titleText, htmlMessage: "<b>脚本异常：</b>" + e.message });
  }
})();
