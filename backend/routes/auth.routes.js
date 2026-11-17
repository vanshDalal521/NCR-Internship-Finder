import { Router } from 'express';
import { login, logout, me } from '../controllers/auth.controller.js';
import { loginLimiter } from '../middleware/rate-limiter.js';

const router = Router();

router.get('/me', me);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);

export default router;
