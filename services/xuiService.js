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
    const payload = {
      id: inboundId,
      settings: JSON.stringify({
        clients: [{ id: uuid, flow: "xtls-rprx-vision", email, enable: true }],
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

  buildVlessLink(uuid, email) {
    const { XUI_HOST, XUI_PBK, XUI_SNI, XUI_SID } = process.env;
    return `vless://${uuid}@${XUI_HOST}:443?type=tcp&encryption=none&security=reality&pbk=${XUI_PBK}&fp=chrome&sni=${XUI_SNI}&sid=${XUI_SID}&spx=%2F#VLESS-${encodeURIComponent(email)}`;
  }

  buildXrayJson(uuid) {
    const { XUI_HOST, XUI_PBK, XUI_SNI, XUI_SID } = process.env;
    const config = {
      log: { loglevel: "warning" },
      dns: { servers: ["1.1.1.1", "8.8.8.8"] },
      inbounds: [
        {
          port: 10808,
          listen: "127.0.0.1",
          protocol: "http",
          settings: { auth: "noauth", udp: true },
        },
      ],
      outbounds: [
        {
          protocol: "vless",
          settings: {
            vnext: [
              {
                address: XUI_HOST,
                port: 443,
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
              publicKey: XUI_PBK,
              shortId: XUI_SID,
              spiderX: "/",
            },
          },
        },
      ],
    };
    return JSON.stringify(config);
  }
}

// Экспортируем сразу экземпляр (Singleton)
module.exports = new XuiService();
