// src/routes/cache-admin.js - Cache administration endpoints
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getCacheStats, invalidateCache, warmupCache } = require('../middleware/cache');

const router = express.Router();

/**
 * GET /api/cache/stats - Get cache statistics
 * Only accessible by secretaries for monitoring
 */
router.get('/stats', requireAuth, (req, res) => {
    if (req.user.user_type !== 'secretary') {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    const stats = getCacheStats();
    
    // Calculate hit rate
    const totalRequests = stats.general.hits + stats.general.misses;
    const hitRate = totalRequests > 0 ? (stats.general.hits / totalRequests * 100).toFixed(2) : 0;
    
    res.json({
        ...stats,
        hitRate: `${hitRate}%`,
        totalRequests,
        timestamp: new Date().toISOString()
    });
});

/**
 * POST /api/cache/invalidate - Invalidate specific cache patterns
 */
router.post('/invalidate', requireAuth, (req, res) => {
    if (req.user.user_type !== 'secretary') {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    const { type, targetId } = req.body;
    
    try {
        switch (type) {
            case 'thesis':
                invalidateCache.onThesisUpdate(targetId);
                break;
            case 'user':
                invalidateCache.onUserUpdate(targetId, req.body.userType);
                break;
            case 'public':
                invalidateCache.onPublicDataUpdate();
                break;
            case 'all':
                invalidateCache.clearAll();
                break;
            default:
                return res.status(400).json({ message: 'Invalid cache type' });
        }
        
        res.json({ 
            message: 'Cache invalidated successfully',
            type,
            targetId: targetId || 'all'
        });
    } catch (error) {
        res.status(500).json({ message: 'Cache invalidation failed', error: error.message });
    }
});

/**
 * POST /api/cache/warmup - Warm up cache
 */
router.post('/warmup', requireAuth, async (req, res) => {
    if (req.user.user_type !== 'secretary') {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    try {
        await warmupCache();
        res.json({ message: 'Cache warmup completed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Cache warmup failed', error: error.message });
    }
});

module.exports = router;

// Usage example in server.js:
/*
// Add to your server.js file:

const { cachePublicAPI, cacheStaticData } = require('./src/middleware/cache');
const cacheAdminRoutes = require('./src/routes/cache-admin');

// Apply caching to public routes
app.use('/api/public/announcements', cachePublicAPI);
app.use('/api/public/statistics', cachePublicAPI);
app.use('/api/public/search', cachePublicAPI);

// Apply caching to static data
app.use('/api/professors/list', cacheStaticData);
app.use('/api/thesis-topics', cacheStaticData);

// Cache administration routes
app.use('/api/cache', cacheAdminRoutes);
*/