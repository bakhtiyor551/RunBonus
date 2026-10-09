import { config } from './config.js';

function authHeader() {
  const token = Buffer.from(`${config.jenkinsUser}:${config.jenkinsToken}`).toString('base64');
  return `Basic ${token}`;
}

function jobApi(suffix = '') {
  // JENKINS_JOB_PATH examples:
  //   RunBonus/master  → /job/RunBonus/job/master
  //   RunBonus_master  → /job/RunBonus_master
  // Also accepts already-encoded "RunBonus/job/master"
  const raw = config.jenkinsJobPath.replace(/^\/+|\/+$/g, '');
  const parts = raw.split('/').filter(Boolean).filter((p) => p !== 'job');
  const path = parts.map((p) => `job/${encodeURIComponent(p)}`).join('/');
  return `${config.jenkinsUrl}/${path}${suffix}`;
}

async function jenkinsFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(),
      ...(options.headers || {}),
    },
  });
  return res;
}

async function crumbHeaders() {
  const res = await jenkinsFetch(`${config.jenkinsUrl}/crumbIssuer/api/json`);
  if (!res.ok) return {};
  const data = await res.json();
  if (!data?.crumb || !data?.crumbRequestField) return {};
  return { [data.crumbRequestField]: data.crumb };
}

export async function getJobStatus() {
  const res = await jenkinsFetch(
    `${jobApi()}/api/json?tree=name,color,inQueue,lastBuild[number,building,result,url,displayName,timestamp]`,
  );
  if (res.status === 404) {
    throw new Error(`Jenkins job not found: ${config.jenkinsJobPath}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jenkins job status HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const building = Boolean(
    data.inQueue
    || data.lastBuild?.building
    || (typeof data.color === 'string' && data.color.endsWith('_anime')),
  );
  return {
    name: data.name,
    color: data.color,
    inQueue: Boolean(data.inQueue),
    building,
    lastBuild: data.lastBuild || null,
  };
}

export async function triggerBuild(cause = 'Telegram ▶ Собрать сейчас') {
  const crumbs = await crumbHeaders();
  const url = `${jobApi()}/build?delay=0sec`;
  const res = await jenkinsFetch(url, {
    method: 'POST',
    headers: {
      ...crumbs,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `cause=${encodeURIComponent(cause)}`,
  });

  // 201 queued, 302 redirect to queue — both OK
  if (res.status !== 201 && res.status !== 200 && res.status !== 302) {
    const body = await res.text();
    throw new Error(`Jenkins trigger HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const queueUrl = res.headers.get('location') || '';
  return { queueUrl, status: res.status };
}

export async function waitForBuildStart(prevNumber, tries = 30, sleepMs = 2000) {
  for (let i = 0; i < tries; i += 1) {
    const st = await getJobStatus();
    const num = st.lastBuild?.number;
    if (st.building && num && (!prevNumber || num > prevNumber)) {
      return st;
    }
    if (num && prevNumber && num > prevNumber) {
      return st;
    }
    await new Promise((r) => setTimeout(r, sleepMs));
  }
  return getJobStatus();
}
