import { Router } from 'express';
import {
  reindexCompanies,
  runAutomationNow,
  systemConfig,
  systemStatus,
} from '../controllers/system.controller.js';
import { writeLimiter } from '../middleware/rate-limiter.js';

const router = Router();

router.get('/config', systemConfig);
router.get('/status', systemStatus);
router.post('/automation/run', writeLimiter, runAutomationNow);
router.post('/reindex-companies', writeLimiter, reindexCompanies);

export default router;
