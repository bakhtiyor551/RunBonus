export class AppleMapsWeb {
  async create() {
    return { ok: false, reason: 'web' };
  }

  async setFrame() {
    return { ok: false };
  }

  async setRoute() {
    return { ok: false };
  }

  async setFollowUser() {
    return { ok: false };
  }

  async setVisible() {
    return { ok: false };
  }

  async destroy() {
    return { ok: true };
  }
}
