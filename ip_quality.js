/*
 * 终极网络质量面板：V6 双雷达并发扫描版
 * 特性：主副接口5秒并发交叉验证、上下分层UI、去重择优展示
 */

const titleText = "网络质量 𝕏";
const NODE_NAME = $environment.params?.node ?? "未知节点";

// === 接口配置 ===
// 主接口 (负责深度风控、原生/广播判定)
const ENGINE_MAIN = "https://my.123169.xyz/v1/info";
// 备用双胞胎接口 (留作备用注释，需要时替换上方主接口)
// const ENGINE_MAIN_BACKUP = "https://my.ippure.com/v1/info"; 

// 测绘接口 (负责精准定位、ISP/ASN、代理/机房基础画像)
const ENGINE_IPAPI = "http://ip-api.com/json/?fields=status,countryCode,country,regionName,city,isp,as,mobile,proxy,hosting&lang=zh-CN";

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
    "Oracle": "甲骨文", "DigitalOcean": "DigitalOcean",
    "Guangxi": "广西", "Nanning": "南宁", "Beijing": "北京", "Shanghai": "上海", "Guangdong": "广东"
  };
  for (let key in dict) {
    t = t.replace(new RegExp(key, 'gi'), dict[key]);
  }
  return t;
}

// === 核心：绝对安全的并发请求封装 ===
// 无论成功还是失败，都会 resolve 返回结果，绝不抛出异常导致进程崩溃
function safeRequest(url, timeoutMs) {
  return new Promise((resolve) => {
    let isTimeout = false;
    const timer = setTimeout(() => {
      isTimeout = true;
      resolve({ error: "超时拦截", data: null });
    }, timeoutMs);

    $httpClient.get({ url: url, node: NODE_NAME }, (error, response, data) => {
      if (isTimeout) return;
      clearTimeout(timer);
      if (error) {
        resolve({ error: "请求失败", data: null });
      } else {
        try {
          resolve({ error: null, data: JSON.parse(data) });
        } catch (e) {
          resolve({ error: "JSON解析失败", data: null });
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
  if (isNaN(s)) return { text: "风险未知", color: "gray" };
  if (s >= 0 && s <= 15) return { text: "极度纯净 🟢", color: "#12512a" };
  if (s >= 16 && s <= 25) return { text: "纯净 ✅", color: "#1b9e4b" };
  if (s >= 26 && s <= 40) return { text: "中性 🟩", color: "#6aa312" };
  if (s >= 41 && s <= 50) return { text: "轻度风险 🟡", color: "#bb8f06" };
  if (s >= 51 && s <= 70) return { text: "中度风险 🟠", color: "#be5105" };
  if (s >= 71 && s <= 100) return { text: "极度风险 🔴", color: "#ae1c1c" };
  return { text: "风险未知", color: "gray" };
}

// === 主程序流 (双雷达并发核心) ===
async function main() {
  // 1. 发令枪响！两个接口同时在 5 秒倒计时内冲刺
  const [mainRes, ipapiRes] = await Promise.all([
    safeRequest(ENGINE_MAIN, 5000),
    safeRequest(ENGINE_IPAPI, 5000)
  ]);

  // 2. 解析基础信息 (优先采信极其精准的 IP-API)
  let baseInfo = { ip: "未知", loc: "未知", isp: "未知", asn: "未知", tags: `<span style="color:gray;">扫描失败/超时</span>` };
  
  if (!ipapiRes.error && ipapiRes.data && ipapiRes.data.status === "success") {
    const d = ipapiRes.data;
    baseInfo.ip = d.query || "未知";
    const flag = getFlagEmoji(d.countryCode);
    const rawLoc = [...new Set([d.country, d.regionName, d.city].filter(Boolean))].join(", ") || "未知";
    baseInfo.loc = flag + translateCN(rawLoc);
    baseInfo.isp = translateCN(d.isp || "未知");
    baseInfo.asn = (d.as && d.as.split(" ")[0].replace("AS", "")) || "未知";

    // IP-API 的专属画像打标
    if (d.proxy === true) baseInfo.tags = `<span style="color:#ae1c1c;">⚠️ 已知代理</span>`;
    else if (d.hosting === true) baseInfo.tags = `<span style="color:#6aa312;">🏢 数据中心</span>`;
    else if (d.mobile === true) baseInfo.tags = `<span style="color:#1b9e4b;">📱 蜂窝网络</span>`;
    else baseInfo.tags = `<span style="color:#12512a;">🏠 住宅家宽</span>`;
  }

  // 3. 解析风控雷达 (主接口)
  let mainInfo = { score: `<span style="color:gray;">风控阻断或超时</span>`, attrs: `<span style="color:gray;">缺失</span>` };
  
  if (!mainRes.error && mainRes.data) {
    const d = mainRes.data;
    
    // 如果 IP-API 意外死机，用主接口的数据兜底基础信息
    if (baseInfo.ip === "未知") {
      baseInfo.ip = d.ipAddress || d.query || d.ip || "未知";
      const flag = getFlagEmoji(d.countryCode);
      const rawLoc = [...new Set([d.country, d.region, d.city].filter(Boolean))].join(", ") || "未知";
      baseInfo.loc = flag + translateCN(rawLoc);
      baseInfo.isp = translateCN(d.asOrganization || d.isp || "未知");
      baseInfo.asn = d.asNumber || d.asn || (d.as && d.as.replace(/[^0-9]/g, "")) || "未知";
    }

    const score = d.fraudScore;
    const level = getScoreLevel(score);
    mainInfo.score = (score !== null && score !== undefined && score !== "N/A" && score !== "") 
      ? `<span style="color:${level.color};">${score}% ${level.text}</span>`
      : `<span style="color:gray;">N/A - 未知</span>`;

    // 严谨的非黑即白判定
    const typeHtml = (d.isResidential === true) ? `<span style="color:#12512a;">🏠 住宅网络</span>` : `<span style="color:#6aa312;">🏢 数据中心</span>`;
    const brdHtml = (d.isBroadcast === true) ? `<span style="color:#bb8f06;">📡 广播</span>` : `<span style="color:#12512a;">🌐 原生</span>`;
    mainInfo.attrs = `${typeHtml} • ${brdHtml}`;
  }

  // 4. 组装极致美观的上下分层 UI
  const html = `
<div style="margin:0;padding:0;font-family:-apple-system;font-size:large;">
<b>IP:</b> ${baseInfo.ip}<br><br>
<b>位置:</b> ${baseInfo.loc}<br><br>
<b>ISP:</b> ${baseInfo.isp}<br><br>
<b>ASN:</b> ${baseInfo.asn}<br>

<hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">
<div style="font-size: 0.85em; color: gray; margin-bottom: 8px;">📊 深度风控雷达 (123169)</div>
<b>属性:</b> ${mainInfo.attrs}<br><br>
<b>纯净:</b> ${mainInfo.score}<br>

<hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">
<div style="font-size: 0.85em; color: gray; margin-bottom: 8px;">🌐 基础测绘雷达 (IP-API)</div>
<b>画像:</b> ${baseInfo.tags}<br><br>

<div>
<b>节点</b> ➟ <span style="color:#1b9e4b;">${NODE_NAME}</span>
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
