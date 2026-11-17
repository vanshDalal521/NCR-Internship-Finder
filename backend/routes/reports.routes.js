import { Router } from 'express';
import { recordReport, reportHistory, reportSummary } from '../controllers/reports.controller.js';
import { writeLimiter } from '../middleware/rate-limiter.js';

const router = Router();

router.get('/summary', reportSummary);
router.get('/history', reportHistory);
router.post('/', writeLimiter, recordReport);

export default router;
