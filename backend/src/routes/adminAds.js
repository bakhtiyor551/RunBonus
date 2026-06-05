import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listAdvertisers,
  saveAdvertiser,
  listCampaigns,
  saveCampaign,
  deleteCampaign,
  listTariffs,
  saveTariff,
  listAdPayments,
  saveAdPayment,
  getAdsStatistics,
  getAdsDashboard,
  getAdSettings,
  updateAdSettings,
} from '../services/adsService.js';

const router = Router();

router.get('/settings', authAdmin, async (_req, res) => {
  try {
    res.json({ settings: await getAdSettings() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.put('/settings', authAdmin, async (req, res) => {
  try {
    const settings = await updateAdSettings(req.body || {});
    res.json({ settings, message: 'Настройки сохранены' });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
  }
});

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

router.delete('/campaigns/:id', authAdmin, async (req, res) => {
  try {
    res.json(await deleteCampaign(req.params.id));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка удаления' });
  }
});

router.get('/tariffs', authAdmin, async (req, res) => {
  try {
    const all = req.query.all === '1' || req.query.all === 'true';
    res.json(await listTariffs({ activeOnly: !all }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/tariffs', authAdmin, async (req, res) => {
  try {
    res.status(201).json(await saveTariff(req.body));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
  }
});

router.put('/tariffs/:id', authAdmin, async (req, res) => {
  try {
    res.json(await saveTariff(req.body, req.params.id));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
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

export default router;
