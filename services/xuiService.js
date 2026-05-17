process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Важно для работы с IP через HTTPS
const { randomUUID } = require("crypto");

class XuiService {
  constructor(httpClient = fetch) {
    this.httpClient = httpClient;
    this.cookie = null;
    this.baseUrl = this.#buildBaseUrl();
  }

  #buildBaseUrl() {
    const host = process.env.XUI_HOST;
    const port = process.env.XUI_PORT;
    const basePath = (process.env.XUI_BASE_PATH || "").replace(
      /^\/+|\/+$/g,
      "",
    );

    if (!host || !port || !basePath) {
      throw new Error(
        "XUI_HOST, XUI_PORT и XUI_BASE_PATH должны быть заданы в Railway",
      );
    }

    return `https://${host}:${port}/${basePath}`;
  }

  #getCredentials() {
    return {
      username: process.env.XUI_USERNAME,
      password: process.env.XUI_PASSWORD,
    };
  }

  async login() {
    const credentials = this.#getCredentials();
    try {
      const response = await this.httpClient(`${this.baseUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const data = await this.#parseJson(response, "Ошибка авторизации");
      this.#assertPanelSuccess(data, "3X-UI отклонил авторизацию");
      const setCookie = response.headers.get("set-cookie");
      if (!setCookie) throw new Error("Куки не получены");

      this.cookie = setCookie.split(";")[0];
      return data;
    } catch (err) {
      console.error("Ошибка логина 3X-UI:", err.message);
      throw err;
    }
  }

  async addClient(inboundId, email) {
    if (!this.cookie) await this.login();

    const uuid = randomUUID();
    const clientEmail = this.#buildClientEmail(email, uuid);
    const payload = {
      id: inboundId,
      settings: JSON.stringify({
        clients: [
          {
            id: uuid,
            flow: "xtls-rprx-vision",
            email: clientEmail,
            enable: true,
          },
        ],
      }),
    };

    const makeReq = () =>
      this.httpClient(`${this.baseUrl}/panel/api/inbounds/addClient`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: this.cookie },
        body: JSON.stringify(payload),
      });

    let response = await makeReq();

    // Если сессия протухла — обновляем один раз
    if (response.status === 401 || response.status === 302) {
      await this.login();
      response = await makeReq();
    }

    const data = await this.#parseJson(response, "Ошибка добавления клиента");
    this.#assertPanelSuccess(data, "3X-UI не добавил VLESS-клиента");
    return { uuid, data };
  }

  async #parseJson(response, defaultMessage) {
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }

    if (!response.ok) {
      throw new Error(
        body?.msg || `${defaultMessage}. HTTP ${response.status}`,
      );
    }
    return body;
  }

  #assertPanelSuccess(data, defaultMessage) {
    if (data?.success === false) {
      throw new Error(data.msg || defaultMessage);
    }
  }

  #buildClientEmail(email, uuid) {
    const safeEmail = String(email || "client").replace(
      /[^a-zA-Z0-9_.@-]/g,
      "_",
    );
    return `${safeEmail}-${uuid.slice(0, 8)}`;
  }

  #getVlessPort() {
    const rawPort =
      process.env.XUI_VLESS_PORT || process.env.XUI_INBOUND_PORT || "443";
    const port = Number(rawPort);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("XUI_VLESS_PORT должен быть числом от 1 до 65535");
    }

    return port;
  }

  buildVlessLink(uuid, email) {
    const { XUI_HOST, XUI_PBK, XUI_SNI, XUI_SID } = process.env;
    const port = this.#getVlessPort();
    const params = new URLSearchParams({
      type: "tcp",
      encryption: "none",
      security: "reality",
      pbk: XUI_PBK,
      fp: "chrome",
      sni: XUI_SNI,
      sid: XUI_SID,
      spx: "/",
    });

    const label = encodeURIComponent(email);
    return `vless://${uuid}@${XUI_HOST}:${port}?${params.toString()}#VLESS-${label}`;
  }

  buildXrayJson(uuid) {
    const { XUI_HOST, XUI_PBK, XUI_SNI, XUI_SID } = process.env;
    const port = this.#getVlessPort();
    const loglevel = process.env.XRAY_LOG_LEVEL || "debug";

    const config = {
      log: { loglevel },
      dns: {
        servers: ["1.1.1.1", "8.8.8.8"],
        queryStrategy: "UseIPv4",
      },
      inbounds: [
        {
          tag: "tun-in",
          protocol: "tun",
          port: 0,
          settings: {
            MTU: 1280,
            name: "utun",
            userLevel: 0,
          },
          sniffing: {
            enabled: true,
            destOverride: ["http", "tls", "quic"],
          },
        },
      ],
      outbounds: [
        {
          protocol: "vless",
          tag: "proxy",
          targetStrategy: "UseIPv4",
          settings: {
            vnext: [
              {
                address: XUI_HOST,
                port,
                users: [
                  { id: uuid, encryption: "none", flow: "xtls-rprx-vision" },
                ],
              },
            ],
          },
          streamSettings: {
            network: "tcp",
            security: "reality",
            realitySettings: {
              fingerprint: "chrome",
              serverName: XUI_SNI,
              password: XUI_PBK,
              publicKey: XUI_PBK,
              shortId: XUI_SID,
              spiderX: "/",
            },
          },
        },
        {
          protocol: "dns",
          tag: "dns-out",
        },
        {
          protocol: "blackhole",
          tag: "block",
        },
      ],
      routing: {
        domainStrategy: "IPIfNonMatch",
        rules: [
          {
            type: "field",
            inboundTag: ["tun-in"],
            network: "tcp,udp",
            port: 53,
            outboundTag: "dns-out",
          },
          {
            type: "field",
            inboundTag: ["tun-in"],
            network: "udp",
            port: 443,
            outboundTag: "block",
          },
          {
            type: "field",
            inboundTag: ["tun-in"],
            outboundTag: "proxy",
          },
        ],
      },
    };
    return JSON.stringify(config);
  }
}

// Экспортируем сразу экземпляр (Singleton)
module.exports = new XuiService();
