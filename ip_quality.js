/*
 *
 *
by https://raw.githubusercontent.com/sooyaaabo/Loon/main/Script/IPPure/IPPure.js
*
*
*/
const titleText = "网络质量 𝕏";
const url = "https://my.123169.xyz/v1/info";

async function request(method, params) {
  return new Promise((resolve) => {
    const httpMethod = $httpClient[method.toLowerCase()];
    httpMethod(params, (error, response, data) => {
      resolve({ error, response, data });
    });
  });
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
  const { error, response, data } = await request("GET", { url, node: nodeName });

  if (error || !data) {
    return $done({ title: titleText, htmlMessage: "<b>网络错误</b>" });
  }

  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return $done({ title: titleText, htmlMessage: "<b>JSON 数据无效</b>" });
  }

  const ip = json.ipAddress || json.query || json.ip || "未知";
  const isp = json.asOrganization || "未知";
  const asn = json.asNumber || json.asn || (json.as && json.as.replace(/[^0-9]/g, "")) || "未知";
  const flag = getFlagEmoji(json.countryCode);
  const loc = (flag ? flag : "") + [...new Set([json.country, json.region, json.city].filter(Boolean))].join(", ") || "未知";

  const score = json.fraudScore;
  const level = getScoreLevel(score);
  const scoreHtml = (score === null || score === undefined || score === "N/A")
    ? `<span style="color:#000;">暂无风险(仅供参考)</span>`
    : score > 0
      ? `<span style="color:${level.color};">${score}% ${level.text}</span>`
      : `<span style="color:${level.color};">${level.text}</span>`;

  const isRes = Boolean(json.isResidential);
  const isBrd = Boolean(json.isBroadcast);
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