async function getVpnConfig(req, res) {
  return res.status(410).json({
    success: false,
    protocol: "vless",
    message: "WireGuard временно отключен. Используйте VLESS/Xray конфиг.",
  });
}

function getAvailableServers(req, res) {
  const servers = [
    {
      id: "vless-reality",
      name: process.env.VLESS_SERVER_NAME || "VLESS Reality",
      flag: process.env.VLESS_SERVER_FLAG || "🌐",
    },
  ];

  return res.status(200).json({
    success: true,
    servers,
  });
}

module.exports = { getVpnConfig, getAvailableServers };
