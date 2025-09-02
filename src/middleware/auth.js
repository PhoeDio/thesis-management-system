// src/middleware/auth.js - Βελτιωμένο Authentication System
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

/**
 * 🔐 Middleware για γενικό authentication
 * Ελέγχει και session και JWT token
 */
const requireAuth = async (req, res, next) => {
    try {
        let userId = null;
        let userType = null;

        // Έλεγχος session πρώτα (preferred method)
        if (req.session && req.session.userId) {
            userId = req.session.userId;
            userType = req.session.userType;
            console.log('🔐 Auth via session:', { userId, userType });
        } 
        // Εναλλακτικά έλεγχος JWT token
        else {
            const authHeader = req.header('Authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
                    userId = decoded.userId;
                    userType = decoded.userType;
                    console.log('🔐 Auth via JWT:', { userId, userType });
                } catch (jwtError) {
                    console.log('❌ Invalid JWT token:', jwtError.message);
                }
            }
        }

        if (!userId) {
            return res.status(401).json({ 
                message: 'Access denied. Please login first.',
                requireLogin: true 
            });
        }

        // Επιβεβαίωση ότι ο χρήστης υπάρχει στη βάση
        const userResult = await pool.query(
            'SELECT id, username, user_type, first_name, last_name, is_active FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
            return res.status(401).json({ 
                message: 'User account not found or inactive.',
                requireLogin: true 
            });
        }

        // Αποθήκευση user info στο request
        req.user = userResult.rows[0];
        req.user.userType = userResult.rows[0].user_type; // Για backward compatibility
        
        next();
    } catch (error) {
        console.error('🔐 Authentication error:', error);
        res.status(500).json({ message: 'Authentication system error' });
    }
};

/**
 * 👥 Middleware για έλεγχο ρόλων
 * @param {Array} allowedRoles - Επιτρεπτοί ρόλοι ['professor', 'student', 'secretary']
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                message: 'Authentication required',
                requireLogin: true 
            });
        }

        if (!allowedRoles.includes(req.user.user_type)) {
            return res.status(403).json({ 
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
                userRole: req.user.user_type,
                requiredRoles: allowedRoles
            });
        }

        console.log(`✅ Role check passed: ${req.user.user_type} accessing ${req.path}`);
        next();
    };
};

/**
 * 🎓 Specific role middleware για professors
 */
const requireProfessor = requireRole(['professor']);

/**
 * 📚 Specific role middleware για students  
 */
const requireStudent = requireRole(['student']);

/**
 * 📋 Specific role middleware για secretary
 */
const requireSecretary = requireRole(['secretary']);

/**
 * 👨‍🏫📋 Combined middleware για professors και secretary
 */
const requireProfessorOrSecretary = requireRole(['professor', 'secretary']);

/**
 * 👤 Middleware για να πάρει extended user information
 * Περιλαμβάνει professor/student profile data
 */
const getCurrentUserProfile = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const userId = req.user.id;
        let profileData = {};

        // Πάρε επιπλέον δεδομένα ανάλογα με τον τύπο χρήστη
        if (req.user.user_type === 'professor') {
            const profResult = await pool.query(
                `SELECT p.id as professor_id, p.office_location, p.phone, p.specialization
                 FROM professors p WHERE p.user_id = $1`,
                [userId]
            );
            
            if (profResult.rows.length > 0) {
                profileData = profResult.rows[0];
            }
        } else if (req.user.user_type === 'student') {
            const studentResult = await pool.query(
                `SELECT s.id as student_id, s.student_id as student_number, 
                        s.phone_mobile, s.phone_landline, s.address, s.contact_email
                 FROM students s WHERE s.user_id = $1`,
                [userId]
            );
            
            if (studentResult.rows.length > 0) {
                profileData = studentResult.rows[0];
            }
        }

        // Ένωση των βασικών δεδομένων με τα profile data
        req.userProfile = {
            ...req.user,
            ...profileData
        };

        next();
    } catch (error) {
        console.error('👤 Get user profile error:', error);
        res.status(500).json({ message: 'Failed to get user profile' });
    }
};

/**
 * 🔒 Middleware για logout (καθαρισμός session)
 */
const logout = (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('🔒 Logout error:', err);
                return res.status(500).json({ message: 'Logout failed' });
            }
            
            res.clearCookie('connect.sid'); // Default session cookie name
            res.json({ 
                message: 'Logout successful',
                success: true 
            });
        });
    } else {
        res.json({ 
            message: 'Already logged out',
            success: true 
        });
    }
};

/**
 * 📊 Debug middleware - δείχνει auth status (μόνο για development)
 */
const debugAuth = (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Auth Debug:', {
            sessionId: req.sessionID,
            hasSession: !!req.session?.userId,
            hasAuthHeader: !!req.header('Authorization'),
            userType: req.session?.userType || 'none',
            path: req.path,
            method: req.method
        });
    }
    next();
};

module.exports = {
    requireAuth,
    requireRole,
    requireProfessor,
    requireStudent,
    requireSecretary,
    requireProfessorOrSecretary,
    getCurrentUserProfile,
    logout,
    debugAuth
};