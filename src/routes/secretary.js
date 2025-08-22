// src/routes/secretary.js - Routes για γραμματεία
const express = require('express');
const { pool } = require('../config/database');
const { requireAuth, requireSecretary, getCurrentUserProfile } = require('../middleware/auth');

const router = express.Router();

// Middleware για όλα τα secretary routes
router.use(requireAuth);
router.use(requireSecretary);
router.use(getCurrentUserProfile);

/**
 * 📋 GET /api/secretary/dashboard - Dashboard data για γραμματεία
 */
router.get('/dashboard', async (req, res) => {
    try {
        // Γενικά στατιστικά συστήματος
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE user_type = 'professor' AND is_active = true) as total_professors,
                (SELECT COUNT(*) FROM users WHERE user_type = 'student' AND is_active = true) as total_students,
                (SELECT COUNT(*) FROM thesis_works WHERE status = 'active') as active_theses,
                (SELECT COUNT(*) FROM thesis_works WHERE status = 'under_examination') as under_examination,
                (SELECT COUNT(*) FROM thesis_works WHERE status = 'completed') as completed_theses,
                (SELECT COUNT(*) FROM thesis_works WHERE status = 'under_assignment') as under_assignment
        `);

        // Πρόσφατες ενέργειες
        const recentActivities = await pool.query(`
            SELECT 
                tw.id,
                tt.title,
                tw.status,
                tw.updated_at,
                CONCAT(student_user.first_name, ' ', student_user.last_name) as student_name,
                s.student_id as student_number,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students st ON tw.student_id = st.id
            JOIN users student_user ON st.user_id = student_user.id
            JOIN students s ON st.id = s.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            WHERE tw.status IN ('active', 'under_examination')
            ORDER BY tw.updated_at DESC
            LIMIT 20
        `);

        res.json({
            statistics: stats.rows[0],
            recent_activities: recentActivities.rows
        });

    } catch (error) {
        console.error('Secretary dashboard error:', error);
        res.status(500).json({ message: 'Failed to load dashboard data' });
    }
});

/**
 * 📊 GET /api/secretary/all-theses - Όλες οι διπλωματικές εργασίες
 */
router.get('/all-theses', async (req, res) => {
    try {
        const { status, supervisor, student, page = 1, limit = 20 } = req.query;
        
        let query = `
            SELECT 
                tw.id,
                tw.status,
                tw.assigned_at,
                tw.activated_at,
                tw.examination_started_at,
                tw.completed_at,
                tw.general_assembly_number,
                tw.general_assembly_year,
                tw.final_grade,
                tt.title,
                tt.description,
                CONCAT(student_user.first_name, ' ', student_user.last_name) as student_name,
                s.student_id as student_number,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students st ON tw.student_id = st.id
            JOIN users student_user ON st.user_id = student_user.id
            JOIN students s ON st.id = s.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 0;

        // Φίλτρα
        if (status) {
            paramCount++;
            query += ` AND tw.status = $${paramCount}`;
            params.push(status);
        }

        if (supervisor) {
            paramCount++;
            query += ` AND (supervisor_user.first_name ILIKE $${paramCount} OR supervisor_user.last_name ILIKE $${paramCount})`;
            params.push(`%${supervisor}%`);
        }

        if (student) {
            paramCount++;
            query += ` AND (student_user.first_name ILIKE $${paramCount} OR student_user.last_name ILIKE $${paramCount} OR s.student_id ILIKE $${paramCount})`;
            params.push(`%${student}%`);
        }

        query += ` ORDER BY tw.updated_at DESC`;

        // Pagination
        const offset = (page - 1) * limit;
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(limit);
        
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(offset);

        const theses = await pool.query(query, params);

        // Μέτρημα συνολικών εγγραφών για pagination
        let countQuery = `
            SELECT COUNT(*) as total
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students st ON tw.student_id = st.id
            JOIN users student_user ON st.user_id = student_user.id
            JOIN students s ON st.id = s.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            WHERE 1=1
        `;

        const countParams = [];
        let countParamCount = 0;

        if (status) {
            countParamCount++;
            countQuery += ` AND tw.status = $${countParamCount}`;
            countParams.push(status);
        }

        if (supervisor) {
            countParamCount++;
            countQuery += ` AND (supervisor_user.first_name ILIKE ${countParamCount} OR supervisor_user.last_name ILIKE ${countParamCount})`;
            countParams.push(`%${supervisor}%`);
        }

        if (student) {
            countParamCount++;
            countQuery += ` AND (student_user.first_name ILIKE ${countParamCount} OR student_user.last_name ILIKE ${countParamCount} OR s.student_id ILIKE ${countParamCount})`;
            countParams.push(`%${student}%`);
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            theses: theses.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get all theses error:', error);
        res.status(500).json({ message: 'Failed to load theses data' });
    }
});

/**
 * 📝 POST /api/secretary/import-users - Εισαγωγή χρηστών από JSON
 */
router.post('/import-users', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { users } = req.body;
        
        if (!Array.isArray(users)) {
            return res.status(400).json({ message: 'Users must be an array' });
        }

        const results = {
            imported: 0,
            skipped: 0,
            errors: []
        };

        for (const userData of users) {
            try {
                const { 
                    username, 
                    email, 
                    first_name, 
                    last_name, 
                    user_type,
                    student_id,
                    specialization,
                    office_location,
                    phone
                } = userData;

                // Validation
                if (!username || !email || !first_name || !last_name || !user_type) {
                    results.errors.push(`Missing required fields for user: ${username || email}`);
                    continue;
                }

                if (!['professor', 'student', 'secretary'].includes(user_type)) {
                    results.errors.push(`Invalid user type for ${username}: ${user_type}`);
                    continue;
                }

                // Check if user exists
                const existingUser = await client.query(
                    'SELECT id FROM users WHERE username = $1 OR email = $2',
                    [username, email]
                );

                if (existingUser.rows.length > 0) {
                    results.skipped++;
                    continue;
                }

                // Generate random password
                const bcrypt = require('bcryptjs');
                const randomPassword = Math.random().toString(36).slice(-8);
                const hashedPassword = await bcrypt.hash(randomPassword, 10);

                // Insert user
                const userResult = await client.query(`
                    INSERT INTO users (username, email, password_hash, user_type, first_name, last_name)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                `, [username, email, hashedPassword, user_type, first_name, last_name]);

                const userId = userResult.rows[0].id;

                // Insert profile data
                if (user_type === 'student') {
                    await client.query(
                        'INSERT INTO students (user_id, student_id) VALUES ($1, $2)',
                        [userId, student_id || `AM${Date.now()}`]
                    );
                } else if (user_type === 'professor') {
                    await client.query(
                        'INSERT INTO professors (user_id, specialization, office_location, phone) VALUES ($1, $2, $3, $4)',
                        [userId, specialization || null, office_location || null, phone || null]
                    );
                }

                results.imported++;

            } catch (userError) {
                results.errors.push(`Error importing ${userData.username || userData.email}: ${userError.message}`);
            }
        }

        await client.query('COMMIT');

        res.json({
            message: 'User import completed',
            results
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Import users error:', error);
        res.status(500).json({ message: 'Failed to import users' });
    } finally {
        client.release();
    }
});

/**
 * 🔧 PUT /api/secretary/thesis/:id/assembly - Καταχώρηση Γενικής Συνέλευσης
 */
router.put('/thesis/:id/assembly', async (req, res) => {
    try {
        const { id } = req.params;
        const { general_assembly_number, general_assembly_year } = req.body;

        if (!general_assembly_number || !general_assembly_year) {
            return res.status(400).json({ message: 'Assembly number and year are required' });
        }

        const result = await pool.query(`
            UPDATE thesis_works 
            SET general_assembly_number = $1, general_assembly_year = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 AND status = 'active'
            RETURNING *
        `, [general_assembly_number, general_assembly_year, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Thesis not found or not in active status' });
        }

        res.json({
            message: 'Assembly information updated successfully',
            thesis: result.rows[0]
        });

    } catch (error) {
        console.error('Update assembly error:', error);
        res.status(500).json({ message: 'Failed to update assembly information' });
    }
});

/**
 * 🔄 PUT /api/secretary/thesis/:id/status - Αλλαγή κατάστασης διπλωματικής
 */
router.put('/thesis/:id/status', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        const { new_status, reason } = req.body;

        const validStatuses = ['under_assignment', 'active', 'under_examination', 'completed', 'cancelled'];
        if (!validStatuses.includes(new_status)) {
            return res.status(400).json({ 
                message: 'Invalid status', 
                validStatuses 
            });
        }

        // Get current thesis
        const currentThesis = await client.query(
            'SELECT * FROM thesis_works WHERE id = $1',
            [id]
        );

        if (currentThesis.rows.length === 0) {
            return res.status(404).json({ message: 'Thesis not found' });
        }

        const thesis = currentThesis.rows[0];
        const oldStatus = thesis.status;

        // Update thesis status
        const updateResult = await client.query(`
            UPDATE thesis_works 
            SET status = $1, updated_at = CURRENT_TIMESTAMP,
                ${new_status === 'completed' ? 'completed_at = CURRENT_TIMESTAMP,' : ''}
                ${new_status === 'cancelled' ? 'cancelled_at = CURRENT_TIMESTAMP, cancelled_by = \'secretary\',' : ''}
            WHERE id = $2
            RETURNING *
        `.replace(/,\s*WHERE/, ' WHERE'), [new_status, id]);

        // Log status change
        await client.query(`
            INSERT INTO thesis_status_history (thesis_id, from_status, to_status, changed_by, change_reason)
            VALUES ($1, $2, $3, $4, $5)
        `, [id, oldStatus, new_status, req.user.id, reason || 'Changed by secretary']);

        await client.query('COMMIT');

        res.json({
            message: 'Thesis status updated successfully',
            thesis: updateResult.rows[0],
            status_change: {
                from: oldStatus,
                to: new_status,
                reason: reason || 'Changed by secretary'
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update thesis status error:', error);
        res.status(500).json({ message: 'Failed to update thesis status' });
    } finally {
        client.release();
    }
});

/**
 * 📊 GET /api/secretary/reports - Αναφορές και στατιστικά
 */
router.get('/reports', async (req, res) => {
    try {
        // Στατιστικά ανά κατάσταση
        const statusStats = await pool.query(`
            SELECT 
                status,
                COUNT(*) as count,
                AVG(CASE WHEN final_grade IS NOT NULL THEN final_grade END) as avg_grade
            FROM thesis_works
            GROUP BY status
            ORDER BY 
                CASE status
                    WHEN 'under_assignment' THEN 1
                    WHEN 'active' THEN 2
                    WHEN 'under_examination' THEN 3
                    WHEN 'completed' THEN 4
                    WHEN 'cancelled' THEN 5
                END
        `);

        // Στατιστικά ανά επιβλέποντα
        const supervisorStats = await pool.query(`
            SELECT 
                CONCAT(u.first_name, ' ', u.last_name) as supervisor_name,
                COUNT(*) as total_theses,
                COUNT(CASE WHEN tw.status = 'completed' THEN 1 END) as completed_theses,
                AVG(CASE WHEN tw.status = 'completed' AND tw.final_grade IS NOT NULL 
                    THEN tw.final_grade END) as avg_grade,
                AVG(CASE WHEN tw.status = 'completed' AND tw.completed_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (tw.completed_at - tw.activated_at))/86400 
                    END) as avg_completion_days
            FROM thesis_works tw
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users u ON p.user_id = u.id
            GROUP BY p.id, u.first_name, u.last_name
            ORDER BY total_theses DESC
        `);

        // Μηνιαία στατιστικά ολοκλήρωσης
        const monthlyCompletions = await pool.query(`
            SELECT 
                EXTRACT(YEAR FROM completed_at) as year,
                EXTRACT(MONTH FROM completed_at) as month,
                COUNT(*) as completions,
                AVG(final_grade) as avg_grade
            FROM thesis_works
            WHERE status = 'completed' AND completed_at IS NOT NULL
                AND completed_at >= CURRENT_DATE - INTERVAL '2 years'
            GROUP BY EXTRACT(YEAR FROM completed_at), EXTRACT(MONTH FROM completed_at)
            ORDER BY year DESC, month DESC
        `);

        res.json({
            status_statistics: statusStats.rows,
            supervisor_statistics: supervisorStats.rows,
            monthly_completions: monthlyCompletions.rows
        });

    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ message: 'Failed to load reports' });
    }
});

/**
 * 👥 GET /api/secretary/users - Διαχείριση χρηστών
 */
router.get('/users', async (req, res) => {
    try {
        const { user_type, search, page = 1, limit = 20 } = req.query;
        
        let query = `
            SELECT 
                u.id,
                u.username,
                u.email,
                u.first_name,
                u.last_name,
                u.user_type,
                u.is_active,
                u.created_at,
                CASE 
                    WHEN u.user_type = 'student' THEN s.student_id
                    ELSE NULL
                END as student_number,
                CASE 
                    WHEN u.user_type = 'professor' THEN p.specialization
                    ELSE NULL
                END as specialization
            FROM users u
            LEFT JOIN students s ON u.id = s.user_id AND u.user_type = 'student'
            LEFT JOIN professors p ON u.id = p.user_id AND u.user_type = 'professor'
            WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 0;

        if (user_type) {
            paramCount++;
            query += ` AND u.user_type = ${paramCount}`;
            params.push(user_type);
        }

        if (search) {
            paramCount++;
            query += ` AND (u.first_name ILIKE ${paramCount} OR u.last_name ILIKE ${paramCount} OR u.username ILIKE ${paramCount} OR u.email ILIKE ${paramCount})`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY u.created_at DESC`;

        // Pagination
        const offset = (page - 1) * limit;
        paramCount++;
        query += ` LIMIT ${paramCount}`;
        params.push(limit);
        
        paramCount++;
        query += ` OFFSET ${paramCount}`;
        params.push(offset);

        const users = await pool.query(query, params);

        res.json({
            users: users.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Failed to load users' });
    }
});

module.exports = router;