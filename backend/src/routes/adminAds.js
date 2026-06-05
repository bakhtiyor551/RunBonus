import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listAdvertisers,
  saveAdvertiser,
  listCampaigns,
  saveCampaign,
  listTariffs,
  listAdPayments,
  saveAdPayment,
  getAdsStatistics,
  getAdsDashboard,
  getAdSettings,
  updateAdSettings,
} from '../services/adsService.js';

const router = Router();

router.get('/dashboard', authAdmin, async (req, res) => {
  try {
    res.json(await getAdsDashboard(req.query));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
  }
});

router.get('/statistics', authAdmin, async (req, res) => {
  try {
    res.json(await getAdsStatistics(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/advertisers', authAdmin, async (_req, res) => {
  try {
    res.json(await listAdvertisers());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/advertisers', authAdmin, async (req, res) => {
  try {
    res.status(201).json(await saveAdvertiser(req.body));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
  }
});

router.put('/advertisers/:id', authAdmin, async (req, res) => {
  try {
    res.json(await saveAdvertiser(req.body, req.params.id));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
  }
});

router.get('/campaigns', authAdmin, async (_req, res) => {
  try {
    res.json(await listCampaigns());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/campaigns', authAdmin, async (req, res) => {
  try {
    res.status(201).json(await saveCampaign(req.body));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
  }
});

router.put('/campaigns/:id', authAdmin, async (req, res) => {
  try {
    res.json(await saveCampaign(req.body, req.params.id));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
  }
});

router.get('/tariffs', authAdmin, async (_req, res) => {
  try {
    res.json(await listTariffs());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/payments', authAdmin, async (_req, res) => {
  try {
    res.json(await listAdPayments());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/payments', authAdmin, async (req, res) => {
  try {
    res.status(201).json(await saveAdPayment(req.body));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
  }
});

router.get('/settings', authAdmin, async (_req, res) => {
  try {
    res.json(await getAdSettings());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка загрузки настроек' });
  }
});

router.put('/settings', authAdmin, async (req, res) => {
  try {
    res.json(await updateAdSettings(req.body || {}));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка сохранения' });
  }
});

export default router;
