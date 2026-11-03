import '../core/api.dart';

Future<Map<String, dynamic>> fetchRewardsProgress() async =>
    Map<String, dynamic>.from(await Api.get('/api/rewards/progress') as Map);

Future<Map<String, dynamic>> fetchRewardMilestone(Object id) async =>
    Map<String, dynamic>.from(await Api.get('/api/rewards/milestones/$id') as Map);

Future<dynamic> fetchMyRewards() => Api.get('/api/rewards/my');

Future<dynamic> selectReward(Map<String, dynamic> payload) => Api.post('/api/rewards/select', payload);
