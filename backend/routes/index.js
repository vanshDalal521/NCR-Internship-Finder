import { Router } from 'express';
import { dashboard } from '../controllers/dashboard.controller.js';
import jobsRoutes from './jobs.routes.js';
import discoverRoutes from './discover.routes.js';
import verificationRoutes from './verification.routes.js';
import companiesRoutes from './companies.routes.js';
import reportsRoutes from './reports.routes.js';
import systemRoutes from './system.routes.js';

const router = Router();

router.get('/dashboard', dashboard);
router.use('/jobs', jobsRoutes);
router.use('/discover', discoverRoutes);
router.use('/verification', verificationRoutes);
router.use('/companies', companiesRoutes);
router.use('/reports', reportsRoutes);
router.use('/system', systemRoutes);

export default router;
