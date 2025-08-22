// src/routes/professor.js - Routes για καθηγητές
const express = require('express');
const { pool } = require('../config/database');
const { requireAuth, requireProfessor, getCurrentUserProfile } = require('../middleware/auth');

const router = express.Router();

// Middleware για όλα τα professor routes
router.use(requireAuth);
router.use(requireProfessor);
router.use(getCurrentUserProfile);

/**
 * 📋 GET /api/professor/dashboard - Dashboard data για καθηγητή
 */
router.get('/dashboard', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        
        if (!professorId) {
            return res.status(404).json({ message: 'Professor profile not found' });
        }

        // Βασικά στατιστικά
        const stats = await pool.query(`
            SELECT 
                COUNT(CASE WHEN tw.status = 'under_assignment' THEN 1 END) as under_assignment_count,
                COUNT(CASE WHEN tw.status = 'active' THEN 1 END) as active_count,
                COUNT(CASE WHEN tw.status = 'under_examination' THEN 1 END) as under_examination_count,
                COUNT(CASE WHEN tw.status = 'completed' THEN 1 END) as completed_count,
                COUNT(*) as total_theses
            FROM thesis_works tw
            WHERE tw.supervisor_id = $1
        `, [professorId]);

        // Πρόσφατες διπλωματικές
        const recentTheses = await pool.query(`
            SELECT 
                tw.id,
                tt.title,
                tw.status,
                tw.created_at,
                tw.updated_at,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                s.student_id as student_number
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students st ON tw.student_id = st.id
            JOIN users u ON st.user_id = u.id
            JOIN students s ON st.id = s.id
            WHERE tw.supervisor_id = $1
            ORDER BY tw.updated_at DESC
            LIMIT 10
        `, [professorId]);

        // Θέματα προς ανάθεση
        const availableTopics = await pool.query(`
            SELECT 
                id,
                title,
                description,
                created_at,
                is_available
            FROM thesis_topics
            WHERE supervisor_id = $1 AND is_available = true
            ORDER BY created_at DESC
        `, [professorId]);

        res.json({
            professor: {
                id: professorId,
                name: `${req.userProfile.first_name} ${req.userProfile.last_name}`,
                specialization: req.userProfile.specialization,
                office_location: req.userProfile.office_location
            },
            statistics: stats.rows[0],
            recent_theses: recentTheses.rows,
            available_topics: availableTopics.rows
        });

    } catch (error) {
        console.error('Professor dashboard error:', error);
        res.status(500).json({ message: 'Failed to load dashboard data' });
    }
});

/**
 * 📝 GET /api/professor/topics - Λίστα θεμάτων καθηγητή
 */
router.get('/topics', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        
        const topics = await pool.query(`
            SELECT 
                tt.id,
                tt.title,
                tt.description,
                tt.detailed_description_file,
                tt.is_available,
                tt.created_at,
                tt.updated_at,
                COUNT(tw.id) as assigned_count
            FROM thesis_topics tt
            LEFT JOIN thesis_works tw ON tt.id = tw.topic_id
            WHERE tt.supervisor_id = $1
            GROUP BY tt.id, tt.title, tt.description, tt.detailed_description_file, 
                     tt.is_available, tt.created_at, tt.updated_at
            ORDER BY tt.created_at DESC
        `, [professorId]);

        res.json({ topics: topics.rows });

    } catch (error) {
        console.error('Get topics error:', error);
        res.status(500).json({ message: 'Failed to load topics' });
    }
});

/**
 * 📝 POST /api/professor/topics - Δημιουργία νέου θέματος
 */
router.post('/topics', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        const { title, description, detailed_description_file } = req.body;

        if (!title || !description) {
            return res.status(400).json({ message: 'Title and description are required' });
        }

        const result = await pool.query(`
            INSERT INTO thesis_topics (title, description, detailed_description_file, supervisor_id, is_available)
            VALUES ($1, $2, $3, $4, true)
            RETURNING *
        `, [title, description, detailed_description_file || null, professorId]);

        res.status(201).json({ 
            message: 'Topic created successfully',
            topic: result.rows[0]
        });

    } catch (error) {
        console.error('Create topic error:', error);
        res.status(500).json({ message: 'Failed to create topic' });
    }
});

/**
 * 👥 GET /api/professor/invitations - Προσκλήσεις για συμμετοχή σε τριμελείς
 */
router.get('/invitations', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        
        const invitations = await pool.query(`
            SELECT 
                tcm.id,
                tcm.thesis_id,
                tcm.role,
                tcm.invited_at,
                tcm.status,
                tt.title as thesis_title,
                tw.status as thesis_status,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name,
                CONCAT(student_user.first_name, ' ', student_user.last_name) as student_name,
                s.student_id as student_number
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN professors supervisor_prof ON tw.supervisor_id = supervisor_prof.id
            JOIN users supervisor_user ON supervisor_prof.user_id = supervisor_user.id
            JOIN students st ON tw.student_id = st.id
            JOIN users student_user ON st.user_id = student_user.id
            JOIN students s ON st.id = s.id
            WHERE tcm.professor_id = $1 AND tcm.status = 'pending'
            ORDER BY tcm.invited_at DESC
        `, [professorId]);

        res.json({ invitations: invitations.rows });

    } catch (error) {
        console.error('Get invitations error:', error);
        res.status(500).json({ message: 'Failed to load invitations' });
    }
});

/**
 * ✅ POST /api/professor/invitations/:id/respond - Απάντηση σε πρόσκληση
 */
router.post('/invitations/:id/respond', async (req, res) => {
    try {
        const { id } = req.params;
        const { response } = req.body; // 'accepted' or 'rejected'
        const professorId = req.userProfile.professor_id;

        if (!['accepted', 'rejected'].includes(response)) {
            return res.status(400).json({ message: 'Response must be "accepted" or "rejected"' });
        }

        const result = await pool.query(`
            UPDATE thesis_committee_members 
            SET status = $1, responded_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND professor_id = $3 AND status = 'pending'
            RETURNING *
        `, [response, id, professorId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Invitation not found or already responded' });
        }

        res.json({ 
            message: `Invitation ${response} successfully`,
            invitation: result.rows[0]
        });

    } catch (error) {
        console.error('Respond to invitation error:', error);
        res.status(500).json({ message: 'Failed to respond to invitation' });
    }
});

/**
 * 📊 GET /api/professor/statistics - Στατιστικά καθηγητή
 */
router.get('/statistics', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        
        // Βασικά στατιστικά
        const basicStats = await pool.query(`
            SELECT 
                COUNT(*) as total_supervised,
                COUNT(CASE WHEN tw.status = 'completed' THEN 1 END) as completed_count,
                AVG(CASE WHEN tw.status = 'completed' AND tw.final_grade IS NOT NULL 
                    THEN tw.final_grade END) as avg_grade,
                AVG(CASE WHEN tw.status = 'completed' AND tw.completed_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (tw.completed_at - tw.activated_at))/86400 
                    END) as avg_completion_days
            FROM thesis_works tw
            WHERE tw.supervisor_id = $1
        `, [professorId]);

        // Στατιστικά ως μέλος τριμελούς
        const committeeStats = await pool.query(`
            SELECT 
                COUNT(*) as committee_participations,
                COUNT(CASE WHEN tw.status = 'completed' THEN 1 END) as committee_completed
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            WHERE tcm.professor_id = $1 AND tcm.status = 'accepted'
        `, [professorId]);

        res.json({
            supervision: basicStats.rows[0],
            committee: committeeStats.rows[0]
        });

    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({ message: 'Failed to load statistics' });
    }
});

module.exports = router;