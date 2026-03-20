/*
 * 终极网络质量面板：三级引擎容灾版 (V2 修补版)
 * 修复：强制节点路由、增加全量汉化翻译
 */

const titleText = "网络质量 𝕏";
const NODE_NAME = $environment.params?.node ?? "未知节点";

// === 引擎配置 ===
const ENGINE_1 = "https://my.123169.xyz/v1/info";
// 备用引擎：如果你有其他的聚合API，填在这里。现在填的是同一个供测试，或者你可以找个备用的
const ENGINE_2 = "hhttps://my.ippure.com/v1/info"; 
// IP-API 加上了 lang=zh-CN 参数实现原生汉化
const ENGINE_3 = "http://ip-api.com/json/?fields=status,countryCode,country,regionName,city,isp,as,mobile,proxy,hosting&lang=zh-CN";

// === 简易汉化字典 ===
function translateCN(text) {
  if (!text) return "未知";
  let t = text;
  const dict = {
    "China": "中国", "Hong Kong": "香港", "Taiwan": "台湾", "Japan": "日本",
    "Singapore": "新加坡", "United States": "美国", "South Korea": "韩国", "Korea": "韩国",
    "United Kingdom": "英国", "Malaysia": "马来西亚", "Germany": "德国",
    "CHINANET": "中国电信", "UNICOM": "中国联通", "MOBILE": "中国移动",
    "PROVINCE NETWORK": "省网", "Tencent": "腾讯", "Alibaba": "阿里巴巴",
    "Google": "谷歌", "Amazon": "亚马逊", "Microsoft": "微软", "Cloudflare": "Cloudflare",
    "Guangxi": "广西", "Nanning": "南宁", "Beijing": "北京", "Shanghai": "上海", "Guangdong": "广东"
  };
  // 遍历替换，忽略大小写
  for (let key in dict) {
    t = t.replace(new RegExp(key, 'gi'), dict[key]);
  }
  return t;
}

// === 核心：带超时的节点请求 ===
function requestWithTimeout(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let isTimeout = false;
    const timer = setTimeout(() => {
      isTimeout = true;
      reject(new Error(`请求超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    // 修复大Bug：必须指定 node，否则默认直连测的是本机IP！
    const options = {
      url: url,
      node: NODE_NAME 
    };

    $httpClient.get(options, (error, response, data) => {
      if (isTimeout) return;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error("JSON 解析失败"));
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

// === 数据适配器 ===
function parseMainEngine(json, engineName) {
  const ip = json.ipAddress || json.query || json.ip || "未知";
  const rawIsp = json.asOrganization || json.isp || "未知";
  const asn = json.asNumber || json.asn || (json.as && json.as.replace(/[^0-9]/g, "")) || "未知";
  const flag = getFlagEmoji(json.countryCode);
  
  const rawLoc = [...new Set([json.country, json.region, json.city].filter(Boolean))].join(", ") || "未知";
  
  // 应用汉化
  const loc = (flag ? flag : "") + translateCN(rawLoc);
  const isp = translateCN(rawIsp);

  const score = json.fraudScore;
  const level = getScoreLevel(score);
  
  const isRes = json.isResidential === true;
  const isBrd = json.isBroadcast === true;
  const isDc = json.isResidential === false; 

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
  if (json.status !== "success") throw new Error("IP-API 返回错误");
  
  const ip = json.query || "未知";
  const isp = translateCN(json.isp || "未知");
  const asn = (json.as && json.as.split(" ")[0].replace("AS", "")) || "未知";
  const flag = getFlagEmoji(json.countryCode);
  
  // IP-API 因为加了 lang=zh-CN，自带部分中文，再用字典兜底翻译一次以防万一
  const rawLoc = [...new Set([json.country, json.regionName, json.city].filter(Boolean))].join(", ") || "未知";
  const loc = (flag ? flag : "") + translateCN(rawLoc);

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
    engine: "兜底引擎",
    ip, loc, isp, asn,
    scoreHtml: `<span style="color:gray;">风险系数未知 (兜底模式)</span>`,
    attrHtml: typeHtml 
  };
}

// === 主程序流 ===
async function main() {
  let standardData = null;

  try {
    const data1 = await requestWithTimeout(ENGINE_1, 3000);
    standardData = parseMainEngine(data1, "主引擎");
  } catch (e1) {
    try {
      const data2 = await requestWithTimeout(ENGINE_2, 3000);
      standardData = parseMainEngine(data2, "备用引擎");
    } catch (e2) {
      try {
        const data3 = await requestWithTimeout(ENGINE_3, 4000);
        standardData = parseFallbackEngine(data3);
      } catch (e3) {
        return $done({ title: titleText, htmlMessage: "<b>网络极差，三级API全部响应超时或失败。</b>" });
      }
    }
  }

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
