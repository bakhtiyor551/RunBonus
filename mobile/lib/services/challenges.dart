import '../core/api.dart';
import '../core/storage.dart';

const _challengeCacheKey = 'rb_home_challenge';
const _finishedFlagKey = 'rb_has_finished_workout';

Future<Map<String, dynamic>> fetchChallengeState() async =>
    Map<String, dynamic>.from(await Api.get('/api/challenges/state') as Map);

Future<Map<String, dynamic>> startChallenge([Object? levelId]) async => Map<String, dynamic>.from(
      await Api.post('/api/challenges/start', levelId != null ? {'levelId': levelId} : {}) as Map,
    );

Future<Map<String, dynamic>> fetchChallengeRewards(Object challengeId) async =>
    Map<String, dynamic>.from(await Api.get('/api/challenges/$challengeId/rewards') as Map);

Future<Map<String, dynamic>> claimChallengeReward(Object challengeId, Map<String, dynamic> payload) async =>
    Map<String, dynamic>.from(await Api.post('/api/challenges/$challengeId/claim', payload) as Map);

Map<String, dynamic>? cachedHomeChallenge() {
  final data = Storage.getJson(_challengeCacheKey);
  return data is Map<String, dynamic> ? data : null;
}

Future<void> cacheHomeChallenge(Map<String, dynamic>? challenge) async {
  if (challenge != null) await Storage.setJson(_challengeCacheKey, challenge);
}

bool get hasFinishedWorkoutFlag => Storage.getString(_finishedFlagKey) == '1';

Future<void> markFinishedWorkout() => Storage.setString(_finishedFlagKey, '1');

/// Бейдж вкладки «Задания»: есть действие по заданию.
Future<int> challengeBadgeCount() async {
  final data = await fetchChallengeState();
  final ch = data['challenge'];
  if (ch is Map && ch['status'] == 'COMPLETED' && ch['rewardClaimed'] != true) return 1;
  if (ch is Map && ch['status'] == 'EXPIRED') return 1;
  final next = data['nextLevel'];
  if (ch == null && next is Map && next['canStart'] == true) return 1;
  return 0;
}
