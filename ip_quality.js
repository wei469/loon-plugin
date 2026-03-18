function flag(code) {
  return code
    ? String.fromCodePoint(
        ...code.toUpperCase().split("").map(c => 127397 + c.charCodeAt())
      )
    : "";
}

function color(score) {
  if (score <= 30) return "green";
  if (score <= 60) return "orange";
  return "red";
}

function level(score) {
  if (score <= 30) return "纯净";
  if (score <= 60) return "一般";
  return "风险";
}

async function req(url, node) {
  return new Promise(resolve => {
    $httpClient.get({ url, node }, (e, r, d) => {
      try { resolve(JSON.parse(d)); } catch { resolve(null); }
    });
  });
}

(async () => {
  const node = $environment.params?.node;

  // IPPure
  let data = await req("https://my.ippure.com/v1/info", node);

  // fallback
  if (!data) {
    data = await req("http://ip-api.com/json/?lang=zh-CN", node);
  }

  const ip = data?.ipAddress || data?.query || "未知";
  const country = data?.country || "未知";
  const code = data?.countryCode || "";
  const city = data?.city || "";
  const isp = data?.asOrganization || data?.isp || "未知";

  const score = data?.fraudScore ?? 50;

  // 类型判断
  const type = data?.ipType === "residential" ? "🏠 住宅IP" : "🏢 机房IP";
  const native = data?.isNative ? "🟢 原生IP" : "🟡 广播IP";

  const html = `
<p style="text-align:center">

<b>🌍 位置</b><br>
${flag(code)} ${country} ${city}<br><br>

<b>🌐 ISP</b><br>
${isp}<br><br>

<b>📡 IP地址</b><br>
${ip}<br><br>

<b>📊 IP类型</b><br>
${type} ｜ ${native}<br><br>

<b>🛡 纯净度</b><br>
<font color="${color(score)}">${100 - score}%（${level(score)}）</font><br><br>

——————————————<br>
节点：${node}
</p>
`;

  $done({
    title: "IP纯净度检测",
    htmlMessage: html
  });
})();
