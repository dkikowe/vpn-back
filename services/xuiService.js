const { randomUUID } = require('crypto');

class XuiService {
  constructor(httpClient = fetch) {
    this.httpClient = httpClient;
    this.cookie = null;
    this.baseUrl = this.#buildBaseUrl();
  }

  #buildBaseUrl() {
    const host = process.env.XUI_HOST;
    const port = process.env.XUI_PORT;
    const basePath = (process.env.XUI_BASE_PATH || '').replace(/^\/+|\/+$/g, '');

    if (!host || !port || !basePath) {
      throw new Error('XUI_HOST, XUI_PORT и XUI_BASE_PATH должны быть заданы в .env');
    }

    return `http://${host}:${port}/${basePath}`;
  }

  #getCredentials() {
    const username = process.env.XUI_USERNAME;
    const password = process.env.XUI_PASSWORD;

    if (!username || !password) {
      throw new Error('XUI_USERNAME и XUI_PASSWORD должны быть заданы в .env');
    }

    return { username, password };
  }

  #assertRealityParams() {
    const required = ['XUI_PBK', 'XUI_SNI', 'XUI_SID'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Не заданы параметры Reality в .env: ${missing.join(', ')}`);
    }
  }

  async #parseJson(response, defaultMessage) {
    let body;
    try {
      body = await response.json();
    } catch (_err) {
      body = null;
    }

    if (!response.ok) {
      const message =
        body?.msg ||
        body?.message ||
        `${defaultMessage}. HTTP ${response.status}`;
      throw new Error(message);
    }

    return body;
  }

  async login() {
    const credentials = this.#getCredentials();
    let response;

    try {
      response = await this.httpClient(`${this.baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
    } catch (_err) {
      throw new Error('Панель 3X-UI недоступна при авторизации');
    }

    const data = await this.#parseJson(response, 'Не удалось авторизоваться в 3X-UI');

    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('3X-UI не вернул set-cookie после логина');
    }

    this.cookie = setCookie.split(';')[0];
    return data;
  }

  async addClient(inboundId, email) {
    if (!inboundId) {
      throw new Error('inboundId обязателен');
    }
    if (!email) {
      throw new Error('email обязателен');
    }

    if (!this.cookie) {
      await this.login();
    }

    const uuid = randomUUID();
    const payload = {
      id: inboundId,
      settings: JSON.stringify({
        clients: [
          {
            id: uuid,
            flow: 'xtls-rprx-vision',
            email,
            limitIp: 0,
            totalGB: 0,
            expiryTime: 0,
            enable: true,
            tgId: '',
            subId: '',
          },
        ],
      }),
    };

    let response;
    try {
      response = await this.httpClient(`${this.baseUrl}/panel/api/inbounds/addClient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: this.cookie,
        },
        body: JSON.stringify(payload),
      });
    } catch (_err) {
      throw new Error('Панель 3X-UI недоступна при добавлении клиента');
    }

    const data = await this.#parseJson(response, 'Не удалось добавить клиента в 3X-UI');
    return { uuid, data };
  }

  buildVlessLink(uuid, email) {
    this.#assertRealityParams();

    const host = process.env.XUI_HOST;
    const pbk = process.env.XUI_PBK;
    const sni = process.env.XUI_SNI;
    const sid = process.env.XUI_SID;

    const safeEmail = encodeURIComponent(email);

    return `vless://${uuid}@${host}:443?type=tcp&encryption=none&security=reality&pbk=${pbk}&fp=chrome&sni=${sni}&sid=${sid}&spx=%2F#VLESS-${safeEmail}`;
  }
}

module.exports = { XuiService };
