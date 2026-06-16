import { api } from '../api';

export async function fetchUserSummary() {
  return api('/api/user/summary');
}
