async function req(url, node) {
  return new Promise((resolve) => {
    $httpClient.get({ url, node }, (err, resp, data) => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });
}

(async () => {
  const node = $environment.params?.node;
  const nodeInfo = $environment.params?.nodeInfo;
  let entryIP = nodeInfo.address;

  // 落地（走代理）
  const out = await req("http://ip-api.com/json/?lang=zh-CN", node);

  // 入口（直连）
  const entry = await req(`http://ip-api.com/json/${entryIP}?lang=zh-CN`);

  let type = "未知";
  let cross = "否";

  if (entry && out) {
    if (entry.query === out.query) {
      type = "直连";
    } else {
      type = "中转";
    }

    if (entry.country === "中国" && out.country !== "中国") {
      cross = "是";
    }
  }

  const html = `
<b>【入口】</b><br>
位置：${entry?.country || "未知"} ${entry?.regionName || ""}<br>
ISP：${entry?.isp || "未知"}<br><br>

<b>【链路】</b><br>
类型：${type}<br>
跨境：${cross}<br><br>

<b>【落地】</b><br>
位置：${out?.country || "未知"} ${out?.city || ""}<br>
IP：${out?.query || "未知"}<br>
ISP：${out?.isp || "未知"}<br>
ASN：${out?.as || "未知"}
`;

  $done({
    title: "链路分析",
    htmlMessage: html
  });
})();