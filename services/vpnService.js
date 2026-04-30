const fs = require('fs');
const { NodeSSH } = require('node-ssh');

class VpnService {
  constructor() {
    this.ssh = new NodeSSH();
  }

  async connect() {
    const host = process.env.SSH_HOST;
    const username = process.env.SSH_USER;
    const password = process.env.SSH_PASSWORD;
    const port = Number(process.env.SSH_PORT || 22);

    if (!host || !username || !password) {
      throw new Error('SSH_HOST, SSH_USER и SSH_PASSWORD должны быть заданы в .env');
    }

    await this.ssh.connect({
      host,
      username,
      password,
      port,
    });
  }

  async generateClientKeys() {
    const privateKeyResult = await this.ssh.execCommand('awg genkey');

    if (privateKeyResult.code !== 0) {
      throw new Error(
        `Не удалось сгенерировать приватный ключ: ${privateKeyResult.stderr || 'unknown error'}`
      );
    }

    const privateKey = (privateKeyResult.stdout || '').trim();
    const publicKeyResult = await this.ssh.execCommand(`echo "${privateKey}" | awg pubkey`);

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
  }

  async addPeer(publicKey, vpnIp, serverIp) {
    const ssh = new NodeSSH();
    const sshKey = fs.readFileSync('/Users/dkikowe/.ssh/id_ed25519', 'utf8');

    try {
      await ssh.connect({
        host: serverIp,
        username: 'root',
        privateKey: sshKey,
        passphrase: process.env.SSH_PASSPHRASE,
      });

      const result = await ssh.execCommand(`awg set awg0 peer ${publicKey} allowed-ips ${vpnIp}/32`);
      if (result.code !== 0) {
        throw new Error(`Не удалось добавить peer в AmneziaWG: ${result.stderr || 'unknown error'}`);
      }

      return true;
    } finally {
      ssh.dispose();
    }
  }

  disconnect() {
    this.ssh.dispose();
  }
}

module.exports = { VpnService };
