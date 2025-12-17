const cloudscraper = require('cloudscraper');
const axios = require('axios');

const BASE_URL = 'https://quests.yom.net';

class YomAPI {
  constructor(cookie) {
    this.cookie = cookie;
    this.headers = {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.5',
      'content-type': 'application/json',
      'cookie': cookie,
      'referer': 'https://quests.yom.net/loyalty',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin'
    };
  }

  async request(method, path, data = null) {
    try {
      const options = {
        method: method,
        uri: BASE_URL + path,
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
      if (error.statusCode === 403) {
        const axiosResponse = await axios({
          method: method,
          url: BASE_URL + path,
          headers: this.headers,
          data: data
        });
        return axiosResponse.data;
      }
      throw error;
    }
  }

  async getSession() {
    return await this.request('GET', '/api/auth/session');
  }

  async getLoyaltyProgram() {
    try {
      const response = await this.request('GET', '/api/loyalty');
      return response;
    } catch (error) {
      console.error('Error getting loyalty program:', error.message);
      return null;
    }
  }

  async getTasks() {
    try {
      const response = await this.request('GET', '/api/loyalty/tasks');
      return response || [];
    } catch (error) {
      console.error('Error getting tasks:', error.message);
      return [];
    }
  }

  async completeTask(taskId) {
    try {
      const response = await this.request('POST', '/api/loyalty/tasks/' + taskId + '/complete');
      return { success: true, data: response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async completeTasks() {
    const tasks = await this.getTasks();
    const results = [];
    
    if (!tasks || tasks.length === 0) {
      return 'No tasks available or failed to fetch tasks.';
    }

    for (const task of tasks) {
      if (task && !task.completed) {
        const result = await this.completeTask(task.id);
        if (result.success) {
          results.push(`✅ ${task.name || task.id}: Completed`);
        } else {
          results.push(`❌ ${task.name || task.id}: ${result.error}`);
        }
        await this.delay(1000);
      } else if (task && task.completed) {
        results.push(`⏭️ ${task.name || task.id}: Already completed`);
      }
    }
    
    if (results.length === 0) {
      return 'All tasks are already completed!';
    }
    
    return results.join('\n');
  }

  async dailyCheckin() {
    try {
      const paths = [
        '/api/loyalty/daily-checkin',
        '/api/loyalty/checkin',
        '/api/user/daily-checkin'
      ];

      for (const path of paths) {
        try {
          const response = await this.request('POST', path);
          if (response) {
            return `✅ Check-in successful!\n${JSON.stringify(response, null, 2)}`;
          }
        } catch (e) {
          continue;
        }
      }

      const rules = await this.getRules();
      if (rules && rules.length > 0) {
        for (const rule of rules) {
          if (rule.type === 'daily_check_in' || rule.id?.includes('check')) {
            try {
              const result = await this.completeRule(rule.id);
              if (result) {
                return `✅ Daily check-in via rule completed!\n${JSON.stringify(result, null, 2)}`;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }

      return '⚠️ Daily check-in endpoint not found. Try completing tasks instead.';
    } catch (error) {
      return `❌ Check-in failed: ${error.message}`;
    }
  }

  async getRules() {
    try {
      const response = await this.request('GET', '/api/loyalty/rules');
      return response || [];
    } catch (error) {
      return [];
    }
  }

  async completeRule(ruleId) {
    try {
      const response = await this.request('POST', '/api/loyalty/rules/' + ruleId + '/complete');
      return response;
    } catch (error) {
      return null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = YomAPI;
