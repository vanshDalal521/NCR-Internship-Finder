import { Router } from 'express';
import {
  analyzeJob,
  analyzePending,
  createManualJob,
  getJob,
  listJobs,
  saveJob,
  unsaveJob,
} from '../controllers/jobs.controller.js';
import { analysisLimiter, writeLimiter } from '../middleware/rate-limiter.js';

const router = Router();

router.get('/', listJobs);
router.post('/', writeLimiter, createManualJob);
router.post('/analyze-pending', analysisLimiter, analyzePending);
router.get('/:id', getJob);
router.post('/:id/analyze', analysisLimiter, analyzeJob);
router.post('/:id/save', writeLimiter, saveJob);
router.delete('/:id/save', writeLimiter, unsaveJob);

export default router;
