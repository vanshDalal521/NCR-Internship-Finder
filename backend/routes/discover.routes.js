import { Router } from 'express';
import {
  discoverSearch,
  discoveryUsage,
  searchHistory,
} from '../controllers/discover.controller.js';
import { discoverLimiter } from '../middleware/rate-limiter.js';

const router = Router();

router.post('/search', discoverLimiter, discoverSearch);
router.get('/history', searchHistory);
router.get('/usage', discoveryUsage);

export default router;
