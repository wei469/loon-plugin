/*
 * 终极网络质量面板：三级引擎容灾版
 * 包含精确降级 UI 与请求超时控制
 */

const titleText = "网络质量 𝕏";
const NODE_NAME = $environment.params?.node ?? "未知节点";

// === 引擎配置 ===
const ENGINE_1 = "https://my.123169.xyz/v1/info";
// 备用引擎 URL (请替换为你实际的 ippure 或其他同类备用 API)
const ENGINE_2 = "https://api.your-backup-engine.com/v1/info"; 
const ENGINE_3 = "http://ip-api.com/json/?fields=status,countryCode,country,regionName,city,isp,as,mobile,proxy,hosting";

// 封装带超时的请求 (核心防卡死逻辑)
function requestWithTimeout(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let isTimeout = false;
    const timer = setTimeout(() => {
      isTimeout = true;
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    // 对于带有查询参数的统一处理，如果是 IP-API 不加 node 参数以免报错
    const isIpApi = url.includes("ip-api.com");
    const reqUrl = isIpApi ? url : `${url}?node=${encodeURIComponent(NODE_NAME)}`;

    $httpClient.get({ url: reqUrl }, (error, response, data) => {
      if (isTimeout) return; // 如果已经超时，忽略回调
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error("JSON Parse Error"));
        }
      }
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
  const s = Number(score);
  if (isNaN(s)) return { text: "风险系数未知", color: "gray" };
  if (s >= 0 && s <= 15) return { text: "极度纯净 🟢", color: "#12512a" };
  if (s >= 16 && s <= 25) return { text: "纯净 ✅", color: "#1b9e4b" };
  if (s >= 26 && s <= 40) return { text: "中性 🟩", color: "#6aa312" };
  if (s >= 41 && s <= 50) return { text: "轻度风险 🟡", color: "#bb8f06" };
  if (s >= 51 && s <= 70) return { text: "中度风险 🟠", color: "#be5105" };
  if (s >= 71 && s <= 100) return { text: "极度风险 🔴", color: "#ae1c1c" };
  return { text: "风险系数未知", color: "gray" };
}

// === 三级数据适配器 (Data Adapter) ===

function parseMainEngine(json, engineName) {
  // 引擎 1 & 2 的解析逻辑
  const ip = json.ipAddress || json.query || json.ip || "未知";
  const isp = json.asOrganization || json.isp || "未知";
  const asn = json.asNumber || json.asn || (json.as && json.as.replace(/[^0-9]/g, "")) || "未知";
  const flag = getFlagEmoji(json.countryCode);
  const loc = (flag ? flag : "") + [...new Set([json.country, json.region, json.city].filter(Boolean))].join(", ") || "未知";

  const score = json.fraudScore;
  const level = getScoreLevel(score);
  
  // 严谨的布尔值判断
  const isRes = json.isResidential === true;
  const isBrd = json.isBroadcast === true;
  const isDc = json.isResidential === false; // 明确为 false 才是数据中心

  let typeHtml = "";
  if (isRes) typeHtml = `<span style="color:#12512a;">🏠 住宅网络</span>`;
  else if (isDc) typeHtml = `<span style="color:#6aa312;">🏢 数据中心</span>`;
  else typeHtml = `<span style="color:gray;">❓ 属性未知</span>`;

  let brdHtml = isBrd ? `<span style="color:#bb8f06;">📡 广播</span>` : `<span style="color:#12512a;">🌐 原生</span>`;

  return {
    engine: engineName,
    ip, loc, isp, asn,
    scoreHtml: (score !== null && score !== undefined && score !== "N/A" && score !== "") 
               ? `<span style="color:${level.color};">${score}% ${level.text}</span>`
               : `<span style="color:gray;">风险系数未知</span>`,
    attrHtml: `${typeHtml} • ${brdHtml}`
  };
}

function parseFallbackEngine(json) {
  // 引擎 3 (IP-API) 的解析逻辑
  if (json.status !== "success") throw new Error("IP-API 返回错误");
  
  const ip = json.query || "未知";
  const isp = json.isp || "未知";
  const asn = (json.as && json.as.split(" ")[0].replace("AS", "")) || "未知";
  const flag = getFlagEmoji(json.countryCode);
  const loc = (flag ? flag : "") + [...new Set([json.country, json.regionName, json.city].filter(Boolean))].join(", ") || "未知";

  // IP-API 的精准打标逻辑
  let typeHtml = "";
  if (json.proxy === true) {
    typeHtml = `<span style="color:#ae1c1c;">⚠️ 已知代理</span>`;
  } else if (json.hosting === true) {
    typeHtml = `<span style="color:#6aa312;">🏢 数据中心</span>`;
  } else if (json.mobile === true) {
    typeHtml = `<span style="color:#1b9e4b;">📱 蜂窝网络</span>`;
  } else {
    typeHtml = `<span style="color:#12512a;">🏠 住宅家宽</span>`;
  }

  return {
    engine: "兜底引擎 (IP-API)",
    ip, loc, isp, asn,
    scoreHtml: `<span style="color:gray;">风险系数未知 (兜底模式)</span>`,
    attrHtml: typeHtml // 只显示精准标签，没有广播/原生判断
  };
}

// === 主程序流 ===
async function main() {
  let standardData = null;

  try {
    // 🥇 第一级：主引擎 (3秒超时)
    const data1 = await requestWithTimeout(ENGINE_1, 3000);
    standardData = parseMainEngine(data1, "主引擎");
  } catch (e1) {
    console.log("主引擎失败: " + e1.message);
    try {
      // 🥈 第二级：备用引擎 (3秒超时)
      const data2 = await requestWithTimeout(ENGINE_2, 3000);
      standardData = parseMainEngine(data2, "备用引擎");
    } catch (e2) {
      console.log("备用引擎失败: " + e2.message);
      try {
        // 🥉 第三级：兜底引擎 (4秒超时)
        const data3 = await requestWithTimeout(ENGINE_3, 4000);
        standardData = parseFallbackEngine(data3);
      } catch (e3) {
        console.log("兜底引擎失败: " + e3.message);
        return $done({ title: titleText, htmlMessage: "<b>网络极差，三级API全部响应超时或失败。</b>" });
      }
    }
  }

  // === 渲染 UI ===
  const html = `
<div style="margin:0;padding:0;font-family:-apple-system;font-size:large;">
<b>IP:</b> ${standardData.ip}<br><br>
<b>位置:</b> ${standardData.loc}<br><br>
<b>ISP:</b> ${standardData.isp}<br><br>
<b>ASN:</b> ${standardData.asn}<br><br>
<b>属性:</b> ${standardData.attrHtml}<br><br>
<b>系数:</b> ${standardData.scoreHtml}<br><br>
<div>
<b>节点</b> ➟ <span style="color:#1b9e4b;">${NODE_NAME}</span> 
<span style="font-size:small;color:gray;">(${standardData.engine})</span>
</div>
</div>
`.trim();

  $done({ title: titleText, htmlMessage: html });
}

(async () => {
  try {
    await main();
  } catch (e) {
    $done({ title: titleText, htmlMessage: "<b>脚本严重错误：</b>" + e.message });
  }
})();
