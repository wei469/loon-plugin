/*
 * 整合版 IP 信息查询脚本 (主备双引擎)
 */

const titleText = "网络质量 𝕏";
const urlMain = "https://my.123169.xyz/v1/info";    // 主接口
const urlBackup = "https://my.ippure.com/v1/info";  // 备用接口
const TIMEOUT_MS = 3000; // 超时时间设置 (毫秒)

// 带超时机制和指定节点的请求封装
async function requestWithTimeout(method, url, nodeName, timeout) {
  return new Promise((resolve) => {
    let isResolved = false;
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve({ error: "Timeout", response: null, data: null });
      }
    }, timeout);

    // 确保 node 参数正确传递，避免查询到本地直连 IP
    const params = { url: url };
    if (nodeName) params.node = nodeName;

    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        resolve({ error, response, data });
      }
    });
  });
}

// 常见国家与 ISP 汉化字典
function translate(text) {
  if (!text) return "";
  const dict = {
    "Taiwan": "台湾", "Hong Kong": "香港", "United States": "美国", "Japan": "日本",
    "Singapore": "新加坡", "United Kingdom": "英国", "Korea": "韩国", "China": "中国",
    "Chunghwa Telecom": "中华电信", "HiNet": "中华电信", "Amazon": "亚马逊",
    "Google": "谷歌", "Microsoft": "微软", "Cloudflare": "Cloudflare",
    "Alibaba": "阿里巴巴", "Tencent": "腾讯", "Oracle": "甲骨文"
  };
  let result = text;
  for (const [en, zh] of Object.entries(dict)) {
    const regex = new RegExp(en, 'gi');
    result = result.replace(regex, zh);
  }
  return result;
}

// 获取国旗 Emoji
function getFlagEmoji(code) {
  if (!code) return "🌍";
  const c = String(code).toUpperCase();
  if (c === "TW") return `<img src="https://he2o.vercel.app/Resource/Icon/Emoji.png" style="width:1.3em;height:1.3em;">`;
  if (c.length !== 2) return "";
  return String.fromCodePoint(...c.split("").map(ch => 127397 + ch.charCodeAt(0))) + " ";
}

// 风险等级颜色与文本
function getScoreLevel(score) {
  if (score === "N/A" || score === null || score === undefined) return { text: "未知", color: "#000" };
  const s = Number(score);
  if (s >= 0 && s <= 15) return { text: "极度纯净 🟢", color: "#12512a" };
  if (s >= 16 && s <= 25) return { text: "纯净 ✅", color: "#1b9e4b" };
  if (s >= 26 && s <= 40) return { text: "中性 🟩", color: "#6aa312" };
  if (s >= 41 && s <= 50) return { text: "轻度风险 🟡", color: "#bb8f06" };
  if (s >= 51 && s <= 70) return { text: "中度风险 🟠", color: "#be5105" };
  if (s >= 71 && s <= 100) return { text: "极度风险 🔴", color: "#ae1c1c" };
  return { text: "未知", color: "#000" };
}

async function main() {
  const nodeName = $environment.params?.node;
  let dataSource = "主接口";

  // 1. 尝试主接口
  let { error, response, data } = await requestWithTimeout("GET", urlMain, nodeName, TIMEOUT_MS);

  // 2. 主接口失败或超时，触发兜底备用接口
  if (error || !data) {
    dataSource = "备用接口";
    const backupRes = await requestWithTimeout("GET", urlBackup, nodeName, TIMEOUT_MS);
    error = backupRes.error;
    response = backupRes.response;
    data = backupRes.data;
  }

  // 彻底失败
  if (error || !data) {
    return $done({ title: titleText, htmlMessage: "<b>网络请求超时或全部失败</b>" });
  }

  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return $done({ title: titleText, htmlMessage: "<b>JSON 数据解析失败</b>" });
  }

  // 数据字段兼容提取
  const ip = json.ipAddress || json.query || json.ip || "未知";
  const isp = translate(json.asOrganization) || "未知";
  const asn = json.asNumber || json.asn || (json.as && json.as.replace(/[^0-9]/g, "")) || "未知";
  
  const flag = getFlagEmoji(json.countryCode);
  const rawLoc = [json.country, json.region, json.city].filter(Boolean).join(", ");
  const loc = (flag ? flag : "") + (translate(rawLoc) || "未知");

  // 风险系数
  const score = json.fraudScore ?? "N/A";
  const level = getScoreLevel(score);
  const scoreHtml = (score === "N/A")
    ? `<span style="color:#000;">暂无风险(仅供参考)</span>`
    : `<span style="color:${level.color};">${score}% ${level.text}</span>`;

  // 严谨的布尔值判断：非黑即白，明确为 true 才是住宅，其余全算作机房
  const isRes = (json.isResidential === true || json.isResidential === "true");
  const isBrd = (json.isBroadcast === true || json.isBroadcast === "true");
  
  const typeText = isRes ? "🏠 住宅网络" : "🏢 数据中心";
  const brdText = isBrd ? "📡 广播" : "🌐 原生";
  const typeColor = isRes ? "#12512a" : "#6aa312";
  const brdColor = isBrd ? "#bb8f06" : "#12512a";
  const htmlType = `<span style="color:${typeColor};">${typeText}</span> • <span style="color:${brdColor};">${brdText}</span>`;

  // HTML 渲染
  const html = `
<div style="margin:0;padding:0;font-family:-apple-system;font-size:large;">

<b>IP:</b> ${ip}<br><br>
<b>位置:</b> ${loc}<br><br>
<b>ISP:</b> ${isp}<br><br>
<b>ASN:</b> ${asn}<br><br>
<b>属性:</b> ${htmlType}<br><br>
<b>系数:</b> ${scoreHtml}<br><br>

<div style="font-size:14px; color:#666;">
<b>节点</b> ➟ <span style="color:${level.color};">${nodeName ?? "未知节点"}</span> 
<span style="font-size:12px;float:right;margin-top:2px;">(数据源: ${dataSource})</span>
</div>

</div>
`.trim();

  return $done({ title: titleText, htmlMessage: html });
}

(async () => {
  try {
    await main();
  } catch (e) {
    $done({ title: titleText, htmlMessage: "<b>脚本错误：</b>" + e.message });
  }
})();
