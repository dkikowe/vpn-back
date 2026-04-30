const { NodeSSH } = require('node-ssh');

class VpnService {
  async _getSshConnection(serverIp, authType) {
    const config = {
      host: serverIp,
      username: process.env.SSH_USER || 'root',
      port: Number(process.env.SSH_PORT || 22),
    };

    if (authType === 'password') {
      if (!process.env.SSH_PASSWORD) {
        throw new Error('SSH_PASSWORD is missing');
      }
      config.password = process.env.SSH_PASSWORD;
    } else if (authType === 'key') {
      let privateKey = process.env.SSH_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SSH_PRIVATE_KEY is missing');
      }
      privateKey = privateKey.replace(/\\n/g, '\n');
      config.privateKey = privateKey;
      config.passphrase = process.env.SSH_PASSPHRASE;
    } else {
      throw new Error(`Unsupported authType: ${authType}`);
    }

    const ssh = new NodeSSH();
    await ssh.connect(config);
    return ssh;
  }

  async generateClientKeys(serverIp, authType) {
    const ssh = await this._getSshConnection(serverIp, authType);

    try {
      const privateKeyResult = await ssh.execCommand('awg genkey');

      if (privateKeyResult.code !== 0) {
        throw new Error(
          `Не удалось сгенерировать приватный ключ: ${privateKeyResult.stderr || 'unknown error'}`
        );
      }

      const privateKey = (privateKeyResult.stdout || '').trim();
      const publicKeyResult = await ssh.execCommand(`echo "${privateKey}" | awg pubkey`);

      if (publicKeyResult.code !== 0) {
        throw new Error(
          `Не удалось сгенерировать публичный ключ: ${publicKeyResult.stderr || 'unknown error'}`
        );
      }

      const publicKey = (publicKeyResult.stdout || '').trim();

      if (!privateKey || !publicKey) {
        throw new Error('SSH вернул некорректный формат ключей');
      }

      return { privateKey, publicKey };
    } finally {
      ssh.dispose();
    }
  }

  async addPeer(publicKey, vpnIp, serverIp, authType) {
    const ssh = await this._getSshConnection(serverIp, authType);

    try {
      const result = await ssh.execCommand(`awg set awg0 peer ${publicKey} allowed-ips ${vpnIp}/32`);
      if (result.code !== 0) {
        throw new Error(`Не удалось добавить peer в AmneziaWG: ${result.stderr || 'unknown error'}`);
      }

      return true;
    } finally {
      ssh.dispose();
    }
  }
}

module.exports = { VpnService };
