import {
  API,
  sanitizeAppearance,
  type Appearance,
  type AuthStartResponse,
  type AuthVerifyResponse,
  type Me,
} from '@the-world/shared';

const SESSION_KEY = 'the-world:session';

function readSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(session: string | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, session);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable: the session lasts until the tab closes.
  }
}

/** Talks to the server's account API: magic-link sign-in, the saved character and wallet. */
export class AccountClient {
  session: string | null = readSession();
  me: Me | null = null;
  /** Called whenever `me` changes (sign-in, sign-out, character saved). */
  onChange: (me: Me | null) => void = () => {};

  constructor(private readonly baseUrl: string) {}

  /** Restores the session (or finishes a sign-in link); returns the account, if signed in. */
  async restore(loginToken: string | null): Promise<Me | null> {
    try {
      if (loginToken) {
        const result = await this.request<AuthVerifyResponse>('POST', API.authVerify, {
          token: loginToken,
        });
        this.session = result.session;
        writeSession(result.session);
        return this.set(result.me);
      }
      if (this.session) return this.set(await this.request<Me>('GET', API.me));
    } catch {
      // Expired link or session, or the server is down: carry on as a guest.
      if (!loginToken) this.signOutLocally();
    }
    return null;
  }

  startSignIn(email: string): Promise<AuthStartResponse> {
    return this.request<AuthStartResponse>('POST', API.authStart, { email });
  }

  async saveCharacter(appearance: Appearance): Promise<void> {
    if (!this.session) return;
    this.set(await this.request<Me>('PUT', API.character, { appearance }));
  }

  async signOut(): Promise<void> {
    if (this.session) await this.request('POST', API.logout).catch(() => undefined);
    this.signOutLocally();
  }

  private signOutLocally(): void {
    this.session = null;
    writeSession(null);
    this.set(null);
  }

  private set(me: Me | null): Me | null {
    this.me = me && { ...me, character: me.character && sanitizeAppearance(me.character) };
    this.onChange(this.me);
    return this.me;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(this.baseUrl + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.session ? { authorization: `Bearer ${this.session}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error ?? `Request failed (${response.status})`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
}
