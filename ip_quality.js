async function request(method, params) {
  return new Promise((resolve) => {
    const fn = $httpClient[method.toLowerCase()];
    fn(params, (err, resp, data) => {
      resolve({ err, resp, data });
    });
  });
}

async function main() {
  const node = $environment.params?.node;

  // 优先 IPPure
  let { data } = await request("GET", {
    url: "https://my.ippure.com/v1/info",
    node
  });

  let json;

  try {
    json = JSON.parse(data);
  } catch {
    // fallback ip-api
    let fallback = await request("GET", {
      url: "http://ip-api.com/json/?lang=zh-CN",
      node
    });
    json = JSON.parse(fallback.data);
  }

  const ip = json.ipAddress || json.query || "未知";
  const isp = json.asOrganization || json.isp || "未知";
  const loc = [json.city, json.region, json.country].filter(Boolean).join(" ");

  const score = json.fraudScore ?? "N/A";

  function level(score) {
    if (score === "N/A") return "未知";
    if (score <= 25) return "纯净";
    if (score <= 50) return "中等";
    return "高风险";
  }

  const html = `
<b>IP:</b> ${ip}<br><br>
<b>位置:</b> ${loc}<br><br>
<b>ISP:</b> ${isp}<br><br>
<b>风险评分:</b> ${score}<br><br>
<b>评级:</b> ${level(score)}
`;

  $done({
    title: "IP纯净度",
    htmlMessage: html
  });
}

main();