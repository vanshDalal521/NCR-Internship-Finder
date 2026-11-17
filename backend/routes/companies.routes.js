import { Router } from 'express';
import { getCompany, listCompanies } from '../controllers/companies.controller.js';

const router = Router();

router.get('/', listCompanies);
router.get('/:id', getCompany);

export default router;
