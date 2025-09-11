// src/middleware/cache.js - Comprehensive Caching System
const NodeCache = require('node-cache');

// Create multiple cache instances for different data types
const caches = {
    // Public API cache - 5 minutes TTL
    public: new NodeCache({ 
        stdTTL: 300,           // 5 minutes
        checkperiod: 60,       // Check for expired keys every minute
        useClones: false       // Performance optimization
    }),
    
    // User data cache - 15 minutes TTL  
    user: new NodeCache({ 
        stdTTL: 900,           // 15 minutes
        checkperiod: 120,      // Check every 2 minutes
        useClones: false
    }),
    
    // Database query cache - 10 minutes TTL
    query: new NodeCache({ 
        stdTTL: 600,           // 10 minutes
        checkperiod: 60,
        useClones: false
    }),
    
    // Static data cache - 1 hour TTL (for rarely changing data)
    static: new NodeCache({ 
        stdTTL: 3600,          // 1 hour
        checkperiod: 300,      // Check every 5 minutes
        useClones: false
    })
};

// Cache statistics for monitoring
let cacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
};

/**
 * Generic cache middleware factory
 * Creates middleware that caches based on request URL and user context
 */
function createCacheMiddleware(cacheType, keyGenerator, ttl) {
    return (req, res, next) => {
        // Skip caching for authenticated routes that need real-time data
        if (req.user && cacheType === 'public') {
            return next();
        }
        
        const cacheKey = keyGenerator ? keyGenerator(req) : generateDefaultKey(req);
        const cache = caches[cacheType];
        
        // Try to get from cache
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            cacheStats.hits++;
            console.log(`🎯 Cache HIT: ${cacheKey}`);
            
            // Set cache headers
            res.set({
                'X-Cache': 'HIT',
                'X-Cache-Key': cacheKey,
                'Cache-Control': 'public, max-age=60'
            });
            
            return res.json(cachedData);
        }
        
        cacheStats.misses++;
        console.log(`❌ Cache MISS: ${cacheKey}`);
        
        // Intercept res.json to cache the response
        const originalJson = res.json;
        res.json = function(data) {
            // Only cache successful responses
            if (res.statusCode === 200) {
                // Custom TTL or use cache default
                if (ttl) {
                    cache.set(cacheKey, data, ttl);
                } else {
                    cache.set(cacheKey, data);
                }
                cacheStats.sets++;
                console.log(`💾 Cached: ${cacheKey}`);
                
                // Set cache headers
                res.set({
                    'X-Cache': 'MISS',
                    'X-Cache-Key': cacheKey,
                    'Cache-Control': 'public, max-age=60'
                });
            }
            
            // Call original json method
            return originalJson.call(this, data);
        };
        
        next();
    };
}

/**
 * Specific cache middleware for public API
 */
const cachePublicAPI = createCacheMiddleware('public', (req) => {
    const baseKey = `public:${req.path}`;
    const params = new URLSearchParams(req.query).toString();
    return params ? `${baseKey}?${params}` : baseKey;
});

/**
 * Cache middleware for user-specific data
 */
const cacheUserData = createCacheMiddleware('user', (req) => {
    const userId = req.user?.id || 'anonymous';
    const userType = req.user?.user_type || 'guest';
    return `user:${userType}:${userId}:${req.path}`;
});

/**
 * Cache middleware for dashboard data
 */
const cacheDashboard = createCacheMiddleware('query', (req) => {
    const userId = req.user?.id || 'anonymous';
    const userType = req.user?.user_type || 'guest';
    return `dashboard:${userType}:${userId}`;
}, 300); // 5 minutes for dashboard data

/**
 * Cache middleware for static data (professors list, thesis topics, etc.)
 */
const cacheStaticData = createCacheMiddleware('static', (req) => {
    return `static:${req.path}`;
});

/**
 * Default key generator
 */
function generateDefaultKey(req) {
    const params = new URLSearchParams(req.query).toString();
    const baseKey = `default:${req.path}`;
    return params ? `${baseKey}?${params}` : baseKey;
}

/**
 * Cache invalidation functions
 */
const invalidateCache = {
    // Clear all cache when thesis status changes
    onThesisUpdate: (thesisId) => {
        const patterns = [
            `public:`,
            `dashboard:`,
            `user:student:`,
            `user:professor:`,
            `query:`
        ];
        
        patterns.forEach(pattern => {
            Object.keys(caches).forEach(cacheType => {
                const cache = caches[cacheType];
                const keys = cache.keys();
                keys.forEach(key => {
                    if (key.includes(pattern)) {
                        cache.del(key);
                        cacheStats.deletes++;
                    }
                });
            });
        });
        
        console.log(`🗑️  Cache invalidated for thesis ${thesisId}`);
    },
    
    // Clear user-specific cache
    onUserUpdate: (userId, userType) => {
        const userCache = caches.user;
        const keys = userCache.keys();
        keys.forEach(key => {
            if (key.includes(`user:${userType}:${userId}`)) {
                userCache.del(key);
                cacheStats.deletes++;
            }
        });
        
        console.log(`🗑️  Cache invalidated for user ${userId}`);
    },
    
    // Clear public cache (when announcements change)
    onPublicDataUpdate: () => {
        caches.public.flushAll();
        cacheStats.deletes++;
        console.log(`🗑️  Public cache cleared`);
    },
    
    // Clear all caches (nuclear option)
    clearAll: () => {
        Object.keys(caches).forEach(cacheType => {
            caches[cacheType].flushAll();
        });
        cacheStats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
        console.log(`🗑️  All caches cleared`);
    }
};

/**
 * Cache statistics and monitoring
 */
function getCacheStats() {
    const stats = {
        general: { ...cacheStats },
        caches: {}
    };
    
    Object.keys(caches).forEach(cacheType => {
        const cache = caches[cacheType];
        stats.caches[cacheType] = {
            keys: cache.keys().length,
            stats: cache.getStats()
        };
    });
    
    return stats;
}

/**
 * Cache warming functions
 */
async function warmupCache() {
    console.log('🔥 Warming up cache...');
    
    // You can add specific cache warming logic here
    // For example, pre-load commonly requested data
    
    try {
        // Simulate warming up public announcements
        console.log('   Warming public announcements cache...');
        
        // Simulate warming up professor lists
        console.log('   Warming professor data cache...');
        
        console.log('✅ Cache warmup completed');
    } catch (error) {
        console.error('❌ Cache warmup failed:', error.message);
    }
}

// Event listeners for cache events
Object.keys(caches).forEach(cacheType => {
    const cache = caches[cacheType];
    
    cache.on('set', (key, value) => {
        console.log(`📦 Cache SET [${cacheType}]: ${key}`);
    });
    
    cache.on('del', (key, value) => {
        console.log(`🗑️  Cache DEL [${cacheType}]: ${key}`);
    });
    
    cache.on('expired', (key, value) => {
        console.log(`⏰ Cache EXPIRED [${cacheType}]: ${key}`);
    });
});

module.exports = {
    // Middleware functions
    cachePublicAPI,
    cacheUserData,
    cacheDashboard,
    cacheStaticData,
    createCacheMiddleware,
    
    // Cache management
    invalidateCache,
    getCacheStats,
    warmupCache,
    
    // Direct access to caches (for custom logic)
    caches
};