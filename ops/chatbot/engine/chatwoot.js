'use strict';
/**
 * Minimal Chatwoot 4.16.2 Application API client, limited to what an Agent
 * Bot token may call (BOT_ACCESSIBLE_ENDPOINTS): conversations show /
 * toggle_status / toggle_priority / custom_attributes, messages create,
 * labels index + create.
 *
 * Auth: `api_access_token` header (4.16.2 does not accept Authorization: Bearer).
 * The token is never logged or returned.
 */

class ChatwootClient {
  /**
   * @param {object} o
   * @param {string} o.baseUrl        e.g. http://127.0.0.1:3009
   * @param {string} o.token          agent bot access token
   * @param {number|string} o.accountId
   * @param {string} [o.forwardedProto]  'https' when Chatwoot runs with FORCE_SSL=true (avoids the http→https redirect)
   * @param {number} [o.timeoutMs]
   * @param {Function} [o.fetchImpl]
   */
  constructor({
    baseUrl,
    token,
    accountId,
    forwardedProto = 'https',
    timeoutMs = 8000,
    fetchImpl,
  } = {}) {
    if (!baseUrl) throw new Error('CHATWOOT_URL is required');
    if (!token) throw new Error('CHATWOOT_BOT_TOKEN is required');
    if (!accountId) throw new Error('CHATWOOT_ACCOUNT_ID is required');
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    Object.defineProperty(this, 'token', { value: String(token), enumerable: false });
    this.accountId = String(accountId);
    this.forwardedProto = forwardedProto;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl || globalThis.fetch;
  }

  toJSON() {
    return { baseUrl: this.baseUrl, accountId: this.accountId };
  }

  conv(convId, suffix = '') {
    return `/api/v1/accounts/${encodeURIComponent(this.accountId)}/conversations/${encodeURIComponent(convId)}${suffix}`;
  }

  async request(method, path, body) {
    const headers = { api_access_token: this.token, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.forwardedProto) headers['X-Forwarded-Proto'] = this.forwardedProto;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
        redirect: 'manual',
      });
      const text = await res.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }
      return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: err && err.name === 'AbortError' ? 'timeout' : 'network',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  sendText(convId, content) {
    return this.request('POST', this.conv(convId, '/messages'), {
      content,
      message_type: 'outgoing',
      private: false,
      content_type: 'text',
    });
  }

  /** Buttons. Item keys must be exactly title + value in 4.16.2. */
  sendSelect(convId, content, items) {
    return this.request('POST', this.conv(convId, '/messages'), {
      content,
      message_type: 'outgoing',
      private: false,
      content_type: 'input_select',
      content_attributes: {
        items: items.map((i) => ({ title: String(i.title), value: String(i.value) })),
      },
    });
  }

  sendNote(convId, content) {
    return this.request('POST', this.conv(convId, '/messages'), {
      content,
      message_type: 'outgoing',
      private: true,
    });
  }

  getConversation(convId) {
    return this.request('GET', this.conv(convId));
  }

  /** Replaces the whole hash: always pass the merged attributes. */
  setCustomAttributes(convId, attrs) {
    return this.request('POST', this.conv(convId, '/custom_attributes'), {
      custom_attributes: attrs,
    });
  }

  async getLabels(convId) {
    const r = await this.request('GET', this.conv(convId, '/labels'));
    const list =
      r.data && Array.isArray(r.data.payload)
        ? r.data.payload
        : Array.isArray(r.data)
          ? r.data
          : [];
    return { ...r, labels: list };
  }

  /** Replaces the label list: pass existing + new. */
  setLabels(convId, labels) {
    return this.request('POST', this.conv(convId, '/labels'), { labels });
  }

  togglePriority(convId, priority) {
    return this.request('POST', this.conv(convId, '/toggle_priority'), { priority });
  }

  /** With the bot token and a pending conversation, status=open is Chatwoot's bot handoff (notifies inbox members). */
  toggleStatus(convId, status) {
    return this.request('POST', this.conv(convId, '/toggle_status'), { status });
  }
}

module.exports = { ChatwootClient };
