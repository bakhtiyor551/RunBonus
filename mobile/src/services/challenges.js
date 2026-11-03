import { api } from '../api';

export function fetchChallengeState() {
  return api('/api/challenges/state');
}

export function startChallenge(levelId) {
  return api('/api/challenges/start', {
    method: 'POST',
    body: JSON.stringify(levelId != null ? { levelId } : {}),
  });
}

export function fetchChallengeRewards(challengeId) {
  return api(`/api/challenges/${challengeId}/rewards`);
}

export function claimChallengeReward(challengeId, payload) {
  return api(`/api/challenges/${challengeId}/claim`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}
