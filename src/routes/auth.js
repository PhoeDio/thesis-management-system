const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const router = express.Router();

// Register route (for development/testing)
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, user_type, first_name, last_name, student_id } = req.body;

        // Check if user already exists
        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password, user_type, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, user_type, first_name, last_name]
        );

        const userId = result.insertId;

        // Insert into specific table based on user type
        if (user_type === 'student') {
            await pool.execute(
                'INSERT INTO students (user_id, student_id) VALUES (?, ?)',
                [userId, student_id]
            );
        } else if (user_type === 'professor') {
            await pool.execute(
                'INSERT INTO professors (user_id) VALUES (?)',
                [userId]
            );
        }

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Registration failed' });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find user
        const [users] = await pool.execute(
            'SELECT id, username, email, password, user_type, first_name, last_name FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Create session
        req.session.userId = user.id;
        req.session.userType = user.user_type;
        req.session.username = user.username;

        // Create JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                userType: user.user_type,
                username: user.username 
            },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                user_type: user.user_type,
                first_name: user.first_name,
                last_name: user.last_name
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Login failed' });
    }
});

// Logout route
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Logout failed' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logout successful' });
    });
});

// Check authentication status
router.get('/me', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const [users] = await pool.execute(
            'SELECT id, username, email, user_type, first_name, last_name FROM users WHERE id = ?',
            [req.session.userId]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'User not found' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Auth check error:', error);
        res.status(500).json({ message: 'Authentication check failed' });
    }
});

module.exports = router;