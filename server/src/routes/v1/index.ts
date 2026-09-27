import { Router } from 'express';

import competitionRoutes from './competitionRoutes';

const router = Router();

// The only place a path segment is added to a route table. A v2 arrives as a
// second directory mounted alongside this one, and nothing else changes.
router.use('/competitions', competitionRoutes);

export default router;
