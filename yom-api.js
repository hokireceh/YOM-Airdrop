const cloudscraper = require('cloudscraper');
const axios = require('axios');
const { ethers } = require('ethers');

const BASE_URL = 'https://quests.yom.net';
const DYNAMIC_AUTH_URL = 'https://app.dynamicauth.com';
const DYNAMIC_SDK_ID = '830cd204-b38a-4927-a00e-b96afc8d869f';

const WEBSITE_ID = '9c659eaa-a6ec-427e-a3a8-ed2cd222c8d8';
const ORGANIZATION_ID = '9cbc4bcb-081d-4499-8b5f-77261171a383';
const LOYALTY_CURRENCY_ID = 'ea516475-1719-401a-80a7-8fa397960271';

class YomAPI {
  constructor(cookie = null, privateKey = null) {
    this.cookie = cookie;
    this.privateKey = privateKey;
    this.wallet = privateKey ? new ethers.Wallet(privateKey) : null;
    this.userId = null;
    this.isAuthenticated = false;
    this.headers = {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.5',
      'content-type': 'application/json',
      'referer': 'https://quests.yom.net/loyalty',
      'origin': 'https://quests.yom.net',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin'
    };
    if (cookie) {
      this.headers['cookie'] = cookie;
      this.isAuthenticated = true;
    }
  }

  async ensureAuthenticated() {
    if (this.isAuthenticated && this.cookie) {
      return true;
    }
    
    if (this.wallet && !this.cookie) {
      const result = await this.loginWithPrivateKey();
      return result.success;
    }
    
    return !!this.cookie;
  }

  async request(method, path, data = null) {
    await this.ensureAuthenticated();
    
    const url = BASE_URL + path;
    
    try {
      const options = {
        method: method,
        uri: url,
        headers: this.headers,
        json: true,
        resolveWithFullResponse: true
      };
      
      if (data) {
        options.body = data;
      }

      const response = await cloudscraper(options);
      return response.body;
    } catch (error) {
      if (error.statusCode === 403 || error.response?.status === 403) {
        const response = await axios({
          method: method,
          url: url,
          headers: this.headers,
          data: data
        });
        return response.data;
      }
      throw error;
    }
  }

  async getNonce() {
    try {
      const response = await axios({
        method: 'GET',
        url: `${DYNAMIC_AUTH_URL}/api/v0/sdk/${DYNAMIC_SDK_ID}/nonce`,
        headers: {
          'accept': '*/*',
          'content-type': 'application/json',
          'origin': 'https://quests.yom.net',
          'referer': 'https://quests.yom.net/',
          'x-dyn-api-version': 'API/0.0.753',
          'x-dyn-version': 'WalletKit/4.27.0'
        }
      });
      return response.data.nonce;
    } catch (error) {
      console.error('Error getting nonce:', error.message);
      return null;
    }
  }

  async loginWithPrivateKey() {
    if (!this.wallet) {
      return { success: false, error: 'Private key not set' };
    }

    try {
      const nonce = await this.getNonce();
      if (!nonce) {
        return { success: false, error: 'Failed to get nonce' };
      }

      const walletAddress = await this.wallet.getAddress();
      const issuedAt = new Date().toISOString();
      const message = `quests.yom.net wants you to sign in with your Ethereum account:\n${walletAddress}\n\nSign in with Ethereum to the app.\n\nURI: https://quests.yom.net\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
      
      const signature = await this.wallet.signMessage(message);

      const authResponse = await axios({
        method: 'POST',
        url: `${DYNAMIC_AUTH_URL}/api/v0/sdk/${DYNAMIC_SDK_ID}/verify`,
        headers: {
          'accept': '*/*',
          'content-type': 'application/json',
          'origin': 'https://quests.yom.net',
          'referer': 'https://quests.yom.net/'
        },
        data: {
          signedMessage: signature,
          messageToSign: message,
          walletPublicKey: walletAddress,
          chain: 'EVM',
          walletName: 'metamask'
        }
      });

      if (authResponse.data && authResponse.headers['set-cookie']) {
        const cookies = authResponse.headers['set-cookie'];
        this.cookie = cookies.map(c => c.split(';')[0]).join('; ');
        this.headers['cookie'] = this.cookie;
        this.isAuthenticated = true;
        return { success: true, wallet: walletAddress, cookie: this.cookie };
      }

      return { success: false, error: 'Auth response missing cookies' };
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  async getSession() {
    return await this.request('GET', '/api/auth/session');
  }

  async getUserInfo() {
    await this.ensureAuthenticated();
    
    let walletAddress;
    if (this.wallet) {
      walletAddress = await this.wallet.getAddress();
    } else {
      const session = await this.getSession();
      if (session && session.address) {
        walletAddress = session.address;
      }
    }

    if (!walletAddress) {
      return null;
    }

    const path = `/api/users?includeDelegation=true&walletAddress=${walletAddress}&websiteId=${WEBSITE_ID}&organizationId=${ORGANIZATION_ID}`;
    const response = await this.request('GET', path);
    
    if (response && response.data && response.data.length > 0) {
      this.userId = response.data[0].id;
      return response.data[0];
    }
    return null;
  }

  async getLoyaltyRules(groupId = null, isSpecial = false) {
    let path = `/api/loyalty/rules?limit=50&websiteId=${WEBSITE_ID}&organizationId=${ORGANIZATION_ID}&excludeHidden=true&excludeExpired=true&isActive=true&isSpecial=${isSpecial}`;
    if (groupId) {
      path += `&loyaltyRuleGroupId=${groupId}`;
    }
    
    try {
      const response = await this.request('GET', path);
      return response?.data || [];
    } catch (error) {
      console.error('Error getting loyalty rules:', error.message);
      return [];
    }
  }

  async getRulesStatus() {
    if (!this.userId) {
      await this.getUserInfo();
    }

    if (!this.userId) return {};

    const path = `/api/loyalty/rules/status?websiteId=${WEBSITE_ID}&organizationId=${ORGANIZATION_ID}&userId=${this.userId}`;
    try {
      const response = await this.request('GET', path);
      return response?.data || response || {};
    } catch (error) {
      console.error('Error getting rules status:', error.message);
      return {};
    }
  }

  async claimRule(ruleId) {
    try {
      const response = await this.request('POST', `/api/loyalty/rules/${ruleId}/claim`, {
        websiteId: WEBSITE_ID,
        organizationId: ORGANIZATION_ID
      });
      return { success: true, data: response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async completeCheckIn() {
    const rules = await this.getLoyaltyRules();
    const results = [];

    for (const rule of rules) {
      if (rule.type === 'check_in') {
        const result = await this.claimRule(rule.id);
        if (result.success) {
          results.push(`✅ ${rule.name}: Check-in berhasil! (+${rule.amount} XP)`);
        } else {
          results.push(`❌ ${rule.name}: ${result.error}`);
        }
      }
    }

    if (results.length === 0) {
      return '⚠️ Tidak ada task check-in yang tersedia.';
    }

    return results.join('\n');
  }

  async completeTasks() {
    const rules = await this.getLoyaltyRules();
    const status = await this.getRulesStatus();
    const results = [];

    for (const rule of rules) {
      const ruleStatus = status[rule.id];
      const isCompleted = ruleStatus?.completed || ruleStatus?.claimedAt;

      if (!isCompleted && rule.claimType === 'manual') {
        try {
          const result = await this.claimRule(rule.id);
          if (result.success) {
            results.push(`✅ ${rule.name}: Completed (+${rule.amount} XP)`);
          } else {
            results.push(`⏭️ ${rule.name}: ${result.error || 'Skipped'}`);
          }
        } catch (e) {
          results.push(`❌ ${rule.name}: ${e.message}`);
        }
        await this.delay(1500);
      } else if (isCompleted) {
        results.push(`⏭️ ${rule.name}: Already completed`);
      }
    }

    if (results.length === 0) {
      return 'Tidak ada task yang bisa diklaim saat ini.';
    }

    return results.join('\n');
  }

  async dailyCheckin() {
    return await this.completeCheckIn();
  }

  async getPoints() {
    try {
      if (!this.userId) {
        await this.getUserInfo();
      }
      
      if (!this.userId) return '0';
      
      const path = `/api/loyalty/accounts?websiteId=${WEBSITE_ID}&organizationId=${ORGANIZATION_ID}&userId=${this.userId}`;
      const response = await this.request('GET', path);
      
      if (response?.data && response.data.length > 0) {
        const account = response.data.find(a => a.loyaltyCurrencyId === LOYALTY_CURRENCY_ID);
        return account?.balance || '0';
      }
      return '0';
    } catch (error) {
      console.error('Error getting points:', error.message);
      return '0';
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = YomAPI;
