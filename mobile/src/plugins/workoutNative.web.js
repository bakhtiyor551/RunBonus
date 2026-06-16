export class WorkoutTrackingWeb {
  async startSession() {
    return { ok: true };
  }

  async stopSession() {
    return { ok: true };
  }

  async getSteps() {
    return { steps: 0, dailySteps: 0 };
  }

  async getDailySteps() {
    return { steps: 0 };
  }

  async startLiveActivity() {
    return { ok: false, enabled: false, active: false };
  }

  async updateLiveActivity() {
    return { ok: false, active: false };
  }

  async endLiveActivity() {
    return { ok: true, active: false };
  }

  async getLiveActivityStatus() {
    return { enabled: false, active: false };
  }
}
