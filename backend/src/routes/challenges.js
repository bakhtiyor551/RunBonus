import { Router } from 'express';
import { authUser } from '../middleware/auth.js';
import {
  getChallengeState,
  startChallenge,
  getChallengeRewardOptions,
  claimChallengeReward,
} from '../services/challengeService.js';

const router = Router();

router.get('/state', authUser, async (req, res) => {
  try {
    const state = await getChallengeState(req.userId);
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось загрузить задания' });
  }
});

/** TZ §33: GET /api/challenges/current */
router.get('/current', authUser, async (req, res) => {
  try {
    const state = await getChallengeState(req.userId);
    res.json({
      ...state,
      challenge: state.challenge || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось загрузить задания' });
  }
});

router.post('/start', authUser, async (req, res) => {
  try {
    const result = await startChallenge(req.userId, {
      levelId: req.body.levelId ?? req.body.level_id,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Не удалось начать задание' });
  }
});

router.get('/:id/rewards', authUser, async (req, res) => {
  try {
    const data = await getChallengeRewardOptions(req.userId, req.params.id);
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Не удалось загрузить награды' });
  }
});

router.post('/:id/claim', authUser, async (req, res) => {
  try {
    const result = await claimChallengeReward(req.userId, {
      challengeId: req.params.id,
      rewardId: req.body.rewardId ?? req.body.reward_id,
      size: req.body.size,
      color: req.body.color,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Не удалось получить награду' });
  }
});

export default router;
