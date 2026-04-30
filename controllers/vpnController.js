const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { VpnService } = require("../services/vpnService");

const VPN_SUBNET_PREFIX = "10.8.0.";
const VPN_HOST_MIN = 2;
const VPN_HOST_MAX = 254;
const SALT_ROUNDS = 10;
const vpnServers = [
  {
    id: "fra1",
    name: "Germany, Frankfurt",
    flag: "🇩🇪",
    authType: "password",
    ip: "46.101.242.165",
    pubKey: "tlswS/GRMm4RviC97BaqodECzn3SkTvtWk81xRUXwUw=",
  },
  {
    id: "ams2",
    name: "Netherlands, Amsterdam",
    flag: "🇳🇱",
    authType: "key",
    ip: "164.90.206.205",
    pubKey: "PPq71nQGLkDJvJHcNFzr+AKDAvdlzABPYq8O4Sd9Whc=",
  },
  {
    id: "syd1",
    name: "Australia, Sydney",
    flag: "🇦🇺",
    authType: "key",
    ip: "209.38.29.183",
    pubKey: "NV4ts7Kr2vdVK+dYmiM9WEsD7pwOgCrxTKypan/1PEc=",
  },
];

function buildRequiredPeerBlock(serverPublicKey, serverIp) {
  return `[Peer]
PublicKey = ${serverPublicKey}
Endpoint = ${serverIp}:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;
}

function buildWireGuardConfig(privateKey, vpnIp, serverIp, serverPublicKey) {
  const lines = [
    "[Interface]",
    `PrivateKey = ${privateKey}`,
    `Address = ${vpnIp}/32`,
    "DNS = 1.1.1.1",
    "",
    "[Peer]",
    `PublicKey = ${serverPublicKey}`,
    `Endpoint = ${serverIp}:51820`,
    "AllowedIPs = 0.0.0.0/0",
    "PersistentKeepalive = 25",
  ];

  // Принудительно формируем Unix-переносы строк, чтобы iOS-парсер видел Endpoint.
  return `${lines.join("\n")}\n`;
}

function assertWireGuardTemplate(config, serverPublicKey, serverIp) {
  if (typeof config !== "string") {
    throw new Error("Сгенерированный WireGuard-конфиг должен быть строкой");
  }

  const normalized = config.replace(/\r\n/g, "\n");
  const requiredPeerBlock = buildRequiredPeerBlock(serverPublicKey, serverIp);
  if (!normalized.includes(requiredPeerBlock)) {
    throw new Error("WireGuard-конфиг не содержит обязательный Peer-блок");
  }
}

/**
 * Выбирает свободный IP в диапазоне 10.8.0.2 - 10.8.0.254.
 */
async function findAvailableVpnIp() {
  const usersWithIp = await User.find(
    {
      vpnIp: { $exists: true, $ne: null },
    },
    { vpnIp: 1 },
  ).lean();

  const usedIps = new Set(
    usersWithIp
      .map((item) => item.vpnIp)
      .filter(Boolean)
      .filter((ip) => ip.startsWith(VPN_SUBNET_PREFIX)),
  );

  for (let host = VPN_HOST_MIN; host <= VPN_HOST_MAX; host += 1) {
    const candidateIp = `${VPN_SUBNET_PREFIX}${host}`;
    if (!usedIps.has(candidateIp)) {
      return candidateIp;
    }
  }

  throw new Error("Свободные VPN IP-адреса закончились");
}

async function resolveUserForConfig(req) {
  const userId = req.user?.id;
  if (userId) {
    return User.findById(userId);
  }

  const randomSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const guestEmail = `guest-${randomSuffix}@vpn.local`;
  const guestPasswordHash = await bcrypt.hash(
    `guest-${randomSuffix}`,
    SALT_ROUNDS,
  );

  return User.create({
    email: guestEmail,
    password: guestPasswordHash,
  });
}

/**
 * GET /api/vpn/config — генерирует и возвращает клиентский WireGuard конфиг.
 */
async function getVpnConfig(req, res, next) {
  const vpnService = new VpnService();
  const serverId = req.body?.serverId || req.params?.serverId;

  console.log("\n=== [VPN ЗАПРОС] Сервер:", serverId, "===");

  try {
    const selectedServer = vpnServers.find((server) => server.id === serverId);
    if (!selectedServer) {
      return res.status(404).json({
        success: false,
        message: "VPN сервер с указанным serverId не найден",
      });
    }

    const user = await resolveUserForConfig(req);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Пользователь не найден",
      });
    }

    const vpnIp = user.vpnIp || (await findAvailableVpnIp());

    const { privateKey, publicKey } = await vpnService.generateClientKeys(
      selectedServer.ip,
      selectedServer.authType,
    );
    await vpnService.addPeer(publicKey, vpnIp, selectedServer.ip, selectedServer.authType);

    user.vpnIp = vpnIp;
    user.vpnPublicKey = publicKey;
    await user.save();

    const config = buildWireGuardConfig(
      privateKey,
      vpnIp,
      selectedServer.ip,
      selectedServer.pubKey,
    );
    assertWireGuardTemplate(config, selectedServer.pubKey, selectedServer.ip);
    console.log("[✅ УСПЕХ] Конфиг отправлен для IP:", vpnIp);

    return res.status(200).json({
      success: true,
      config: {
        serverAddress: selectedServer.ip,
        serverPort: "51820",
        privateKey,
        publicKey: selectedServer.pubKey,
        allowedIPs: ["0.0.0.0/0"],
        address: `${vpnIp}/32`,
        dns: ["8.8.8.8"],
        jc: "120",
        jmin: "50",
        jmax: "1000",
        s1: "113",
        s2: "120",
        h1: "1",
        h2: "2",
        h3: "3",
        h4: "4",
      },
      rawConfig: config,
    });
  } catch (err) {
    console.error("[❌ ОШИБКА БЭКЕНДА]:", err.message);
    return res
      .status(500)
      .json({ success: false, message: err.message, error: err.stack });
  }
}

/**
 * GET /api/vpn/servers — возвращает список доступных VPN-локаций без секретных полей.
 */
function getAvailableServers(req, res) {
  const servers = vpnServers.map(({ id, name, flag }) => ({
    id,
    name,
    flag,
  }));

  return res.status(200).json({
    success: true,
    servers,
  });
}

module.exports = { getVpnConfig, getAvailableServers, vpnServers };
