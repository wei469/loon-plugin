function flag(code) {
  return code
    ? String.fromCodePoint(
        ...code.toUpperCase().split("").map(c => 127397 + c.charCodeAt())
      )
    : "";
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
  const nodeInfo = $environment.params?.nodeInfo;

  let entryIP = nodeInfo.address;

  // 落地（代理）
  const out = await req("http://ip-api.com/json/?lang=zh-CN", node);

  // 入口（优先 speedtest.cn）
  let entry = await req(`https://api-v3.speedtest.cn/ip?ip=${entryIP}`);

  // fallback
  if (!entry?.data) {
    entry = await req(`http://ip-api.com/json/${entryIP}?lang=zh-CN`);
  }

  let entryData = entry?.data || entry;

  let type = "未知";
  let cross = "否";

  if (entryData && out) {
    if (entryIP === out.query) {
      type = "直连";
    } else {
      type = "中转";
    }

    if (entryData.country === "中国" && out.country !== "中国") {
      cross = "是";
    }
  }

  const html = `
<p style="text-align:center">

<b>📍 入口</b><br>
${flag(entryData?.countryCode)} ${entryData?.country || ""} ${entryData?.province || entryData?.regionName || ""}<br>
${entryData?.isp || "未知"}<br><br>

<b>🔗 链路</b><br>
类型：${type}<br>
跨境：${cross}<br><br>

<b>🌍 落地</b><br>
${flag(out?.countryCode)} ${out?.country || ""} ${out?.city || ""}<br>
${out?.isp || "未知"}<br>
IP：${out?.query || ""}<br>
ASN：${out?.as || ""}<br><br>

——————————————<br>
节点：${node}

</p>
`;

  $done({
    title: "链路分析",
    htmlMessage: html
  });
})();
