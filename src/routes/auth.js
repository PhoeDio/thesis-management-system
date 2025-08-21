// src/routes/auth.js - Βελτιωμένα Authentication Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { requireAuth, getCurrentUserProfile, debugAuth } = require('../middleware/auth');

const router = express.Router();

// Debug middleware (μόνο για development)
router.use(debugAuth);

/**
 * 📝 POST /api/auth/register - Εγγραφή νέου χρήστη
 * Body: { username, email, password, user_type, first_name, last_name, student_id? }
 */
router.post('/register', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { 
            username, 
            email, 
            password, 
            user_type, 
            first_name, 
            last_name, 
            student_id,
            office_location,
            phone,
            specialization 
        } = req.body;

        // 🔍 Validation
        if (!username || !email || !password || !user_type || !first_name || !last_name) {
            return res.status(400).json({ 
                message: 'Missing required fields',
                required: ['username', 'email', 'password', 'user_type', 'first_name', 'last_name']
            });
        }

        if (!['professor', 'student', 'secretary'].includes(user_type)) {
            return res.status(400).json({ 
                message: 'Invalid user type',
                validTypes: ['professor', 'student', 'secretary']
            });
        }

        if (user_type === 'student' && !student_id) {
            return res.status(400).json({ message: 'Student ID is required for student accounts' });
        }

        // 🔍 Check if user already exists
        const existingUser = await client.query(
            'SELECT id, username, email FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            const existing = existingUser.rows[0];
            return res.status(400).json({ 
                message: 'User already exists',
                conflictField: existing.username === username ? 'username' : 'email'
            });
        }

        // 🔒 Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 👤 Insert user
        const userResult = await client.query(
            `INSERT INTO users (username, email, password_hash, user_type, first_name, last_name) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING id, username, email, user_type, first_name, last_name, created_at`,
            [username, email, hashedPassword, user_type, first_name, last_name]
        );

        const newUser = userResult.rows[0];

        // 📋 Insert into specific profile table
        if (user_type === 'student') {
            await client.query(
                'INSERT INTO students (user_id, student_id) VALUES ($1, $2)',
                [newUser.id, student_id]
            );
        } else if (user_type === 'professor') {
            await client.query(
                'INSERT INTO professors (user_id, office_location, phone, specialization) VALUES ($1, $2, $3, $4)',
                [newUser.id, office_location || null, phone || null, specialization || null]
            );
        }

        await client.query('COMMIT');
        
        console.log('✅ New user registered:', { 
            id: newUser.id, 
            username: newUser.username, 
            type: newUser.user_type 
        });

        res.status(201).json({ 
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                user_type: newUser.user_type,
                first_name: newUser.first_name,
                last_name: newUser.last_name,
                created_at: newUser.created_at
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Registration error:', error);
        
        // Specific error handling
        if (error.code === '23505') { // PostgreSQL unique violation
            res.status(400).json({ message: 'Username or email already exists' });
        } else {
            res.status(500).json({ message: 'Registration failed', error: error.message });
        }
    } finally {
        client.release();
    }
});

/**
 * 🔐 POST /api/auth/login - Σύνδεση χρήστη
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                message: 'Username and password are required' 
            });
        }

        // 🔍 Find user with profile data
        const result = await pool.query(
            `SELECT u.id, u.username, u.email, u.password_hash, u.user_type, 
                    u.first_name, u.last_name, u.is_active,
                    CASE 
                        WHEN u.user_type = 'professor' THEN p.id
                        WHEN u.user_type = 'student' THEN s.id
                        ELSE NULL
                    END as profile_id,
                    CASE 
                        WHEN u.user_type = 'student' THEN s.student_id
                        ELSE NULL
                    END as student_number
             FROM users u
             LEFT JOIN professors p ON u.id = p.user_id AND u.user_type = 'professor'
             LEFT JOIN students s ON u.id = s.user_id AND u.user_type = 'student'
             WHERE u.username = $1`,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const user = result.rows[0];

        // Check if account is active
        if (!user.is_active) {
            return res.status(401).json({ message: 'Account is deactivated' });
        }

        // 🔒 Check password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // 🎫 Create session
        req.session.userId = user.id;
        req.session.userType = user.user_type;
        req.session.username = user.username;
        req.session.profileId = user.profile_id;

        // 🎫 Create JWT token (για API access)
        const tokenPayload = { 
            userId: user.id, 
            userType: user.user_type,
            username: user.username,
            profileId: user.profile_id
        };
        
        const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
        );

        console.log('✅ User logged in:', { 
            id: user.id, 
            username: user.username, 
            type: user.user_type 
        });

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                user_type: user.user_type,
                first_name: user.first_name,
                last_name: user.last_name,
                profile_id: user.profile_id,
                student_number: user.student_number
            },
            token,
            sessionId: req.sessionID
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
});

/**
 * 🚪 POST /api/auth/logout - Αποσύνδεση
 */
router.post('/logout', (req, res) => {
    const userId = req.session?.userId;
    
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('🚪 Logout error:', err);
                return res.status(500).json({ message: 'Logout failed' });
            }
            
            console.log('✅ User logged out:', { userId });
            res.clearCookie('connect.sid');
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
});

/**
 * 👤 GET /api/auth/me - Πληροφορίες τρέχοντος χρήστη
 */
router.get('/me', requireAuth, getCurrentUserProfile, (req, res) => {
    res.json({ 
        user: req.userProfile,
        session: {
            sessionId: req.sessionID,
            hasSession: !!req.session?.userId
        }
    });
});

/**
 * 🔧 GET /api/auth/status - Authentication status (για debugging)
 */
router.get('/status', (req, res) => {
    res.json({
        authenticated: !!req.session?.userId,
        sessionId: req.sessionID,
        userId: req.session?.userId || null,
        userType: req.session?.userType || null,
        hasAuthHeader: !!req.header('Authorization'),
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
