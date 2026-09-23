import { api } from '../api';

export function fetchRewardsProgress() {
  return api('/api/rewards/progress');
}

export function fetchRewardMilestones() {
  return api('/api/rewards/milestones');
}

export function fetchRewardMilestone(id) {
  return api(`/api/rewards/milestones/${id}`);
}

export function fetchMyRewards() {
  return api('/api/rewards/my');
}

export function selectReward(payload) {
  return api('/api/rewards/select', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
