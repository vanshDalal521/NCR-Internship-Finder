import { Router } from 'express';
import { checkLink, verificationLogs, verificationQueue, verifyJob } from '../controllers/verification.controller.js';
import { writeLimiter } from '../middleware/rate-limiter.js';

const router = Router();

router.get('/queue', verificationQueue);
router.get('/logs', verificationLogs);
router.post('/:id/check-link', writeLimiter, checkLink);
router.post('/:id/verify', writeLimiter, verifyJob);

export default router;
