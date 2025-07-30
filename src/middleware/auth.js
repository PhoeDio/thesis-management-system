const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// General authentication middleware
const requireAuth = (req, res, next) => {
    // Check session first
    if (req.session && req.session.userId) {
        return next();
    }

    // Check JWT token as fallback
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token.' });
    }
};

// Role-based authentication middleware
const requireRole = (roles) => {
    return (req, res, next) => {
        // First ensure user is authenticated
        if (!req.session?.userId && !req.user?.userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const userType = req.session?.userType || req.user?.userType;
        
        if (!roles.includes(userType)) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }

        next();
    };
};

// Specific role middlewares
const requireProfessor = requireRole(['professor']);
const requireStudent = requireRole(['student']);
const requireSecretary = requireRole(['secretary']);
const requireProfessorOrSecretary = requireRole(['professor', 'secretary']);

// Get current user info
const getCurrentUser = async (req, res, next) => {
    try {
        const userId = req.session?.userId || req.user?.userId;
        
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const [users] = await pool.execute(
            `SELECT u.id, u.username, u.email, u.user_type, u.first_name, u.last_name,
                    CASE 
                        WHEN u.user_type = 'professor' THEN p.id
                        WHEN u.user_type = 'student' THEN s.id
                        ELSE NULL
                    END as profile_id
             FROM users u
             LEFT JOIN professors p ON u.id = p.user_id AND u.user_type = 'professor'
             LEFT JOIN students s ON u.id = s.user_id AND u.user_type = 'student'
             WHERE u.id = ?`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        req.currentUser = users[0];
        next();
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ message: 'Failed to get user information' });
    }
};

module.exports = {
    requireAuth,
    requireRole,
    requireProfessor,
    requireStudent,
    requireSecretary,
    requireProfessorOrSecretary,
    getCurrentUser
};