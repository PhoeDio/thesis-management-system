
// src/routes/student.js - Routes για φοιτητές
const express = require('express');
const { pool } = require('../config/database');
const { requireAuth, requireStudent, getCurrentUserProfile } = require('../middleware/auth');

const router = express.Router();


// Middleware για όλα τα student routes
router.use(requireAuth);
router.use(requireStudent);
router.use(getCurrentUserProfile);

/**
 * 📋 GET /api/student/dashboard - Dashboard data για φοιτητή
 */
router.get('/dashboard', async (req, res) => {
    try {
        const studentId = req.userProfile.student_id;
        
        if (!studentId) {
            return res.status(404).json({ message: 'Student profile not found' });
        }

        // Πληροφορίες τρέχουσας διπλωματικής
        const currentThesis = await pool.query(`
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
                tw.repository_link,
                tt.title,
                tt.description,
                tt.detailed_description_file,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name,
                p.office_location as supervisor_office,
                p.phone as supervisor_phone
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            WHERE tw.student_id = $1
            ORDER BY tw.created_at DESC
            LIMIT 1
        `, [studentId]);

        // Μέλη τριμελούς επιτροπής (αν υπάρχει διπλωματική)
        let committeeMembers = [];
        if (currentThesis.rows.length > 0) {
            const committee = await pool.query(`
                SELECT 
                    tcm.role,
                    tcm.status,
                    tcm.invited_at,
                    tcm.responded_at,
                    CONCAT(u.first_name, ' ', u.last_name) as professor_name,
                    p.specialization,
                    p.office_location
                FROM thesis_committee_members tcm
                JOIN professors p ON tcm.professor_id = p.id
                JOIN users u ON p.user_id = u.id
                WHERE tcm.thesis_id = $1
                ORDER BY tcm.role, tcm.invited_at
            `, [currentThesis.rows[0].id]);
            
            committeeMembers = committee.rows;
        }

        // Αρχεία διπλωματικής
        let thesisFiles = [];
        if (currentThesis.rows.length > 0) {
            const files = await pool.query(`
                SELECT 
                    id,
                    file_name,
                    file_type,
                    uploaded_at
                FROM thesis_files
                WHERE thesis_id = $1
                ORDER BY uploaded_at DESC
            `, [currentThesis.rows[0].id]);
            
            thesisFiles = files.rows;
        }

        res.json({
            student: {
                id: studentId,
                name: `${req.userProfile.first_name} ${req.userProfile.last_name}`,
                student_number: req.userProfile.student_number,
                email: req.userProfile.email,
                phone_mobile: req.userProfile.phone_mobile,
                address: req.userProfile.address
            },
            current_thesis: currentThesis.rows[0] || null,
            committee_members: committeeMembers,
            thesis_files: thesisFiles
        });

    } catch (error) {
        console.error('Student dashboard error:', error);
        res.status(500).json({ message: 'Failed to load dashboard data' });
    }
});

/**
 * 👤 GET/PUT /api/student/profile - Διαχείριση προφίλ φοιτητή
 */
router.get('/profile', async (req, res) => {
    try {
        const studentId = req.userProfile.student_id;
        
        const profile = await pool.query(`
            SELECT 
                s.phone_mobile,
                s.phone_landline,
                s.address,
                s.contact_email,
                u.email,
                u.first_name,
                u.last_name
            FROM students s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = $1
        `, [studentId]);

        if (profile.rows.length === 0) {
            return res.status(404).json({ message: 'Student profile not found' });
        }

        res.json({ profile: profile.rows[0] });

    } catch (error) {
        console.error('Get student profile error:', error);
        res.status(500).json({ message: 'Failed to load profile' });
    }
});

router.put('/profile', async (req, res) => {
    try {
        const studentId = req.userProfile.student_id;
        const { phone_mobile, phone_landline, address, contact_email } = req.body;

        const result = await pool.query(`
            UPDATE students 
            SET phone_mobile = $1, phone_landline = $2, address = $3, contact_email = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            RETURNING *
        `, [phone_mobile, phone_landline, address, contact_email, studentId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student profile not found' });
        }

        res.json({ 
            message: 'Profile updated successfully',
            profile: result.rows[0]
        });

    } catch (error) {
        console.error('Update student profile error:', error);
        res.status(500).json({ message: 'Failed to update profile' });
    }
});

/**
 * 👥 POST /api/student/invite-committee - Πρόσκληση μελών σε τριμελή
 */
router.post('/invite-committee', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const studentId = req.userProfile.student_id;
        const { professor_ids } = req.body; // Array με IDs καθηγητών

        if (!Array.isArray(professor_ids) || professor_ids.length !== 2) {
            return res.status(400).json({ message: 'Exactly 2 professor IDs are required' });
        }

        // Βρες την ενεργή διπλωματική του φοιτητή
        const thesis = await client.query(`
            SELECT id, status FROM thesis_works 
            WHERE student_id = $1 AND status = 'under_assignment'
        `, [studentId]);

        if (thesis.rows.length === 0) {
            return res.status(400).json({ message: 'No thesis under assignment found' });
        }

        const thesisId = thesis.rows[0].id;

        // Έλεγχος ότι οι καθηγητές δεν είναι ήδη προσκεκλημένοι
        const existingInvites = await client.query(`
            SELECT professor_id FROM thesis_committee_members 
            WHERE thesis_id = $1 AND professor_id = ANY($2)
        `, [thesisId, professor_ids]);

        if (existingInvites.rows.length > 0) {
            return res.status(400).json({ message: 'Some professors are already invited' });
        }

        // Δημιουργία προσκλήσεων
        const invitations = [];
        for (const professorId of professor_ids) {
            const invite = await client.query(`
                INSERT INTO thesis_committee_members (thesis_id, professor_id, role, status)
                VALUES ($1, $2, 'member', 'pending')
                RETURNING *
            `, [thesisId, professorId]);
            
            invitations.push(invite.rows[0]);
        }

        await client.query('COMMIT');

        res.json({ 
            message: 'Committee invitations sent successfully',
            invitations
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Invite committee error:', error);
        res.status(500).json({ message: 'Failed to send invitations' });
    } finally {
        client.release();
    }
});

/**
 * 📝 GET /api/student/thesis-details - Λεπτομέρειες διπλωματικής
 */
router.get('/thesis-details', async (req, res) => {
    try {
        const studentId = req.userProfile.student_id;
        
        const thesis = await pool.query(`
            SELECT 
                tw.*,
                tt.title,
                tt.description,
                tt.detailed_description_file,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            WHERE tw.student_id = $1
            ORDER BY tw.created_at DESC
            LIMIT 1
        `, [studentId]);

        if (thesis.rows.length === 0) {
            return res.status(404).json({ message: 'No thesis found' });
        }

        // Ιστορικό αλλαγών κατάστασης
        const statusHistory = await pool.query(`
            SELECT 
                tsh.*,
                CONCAT(u.first_name, ' ', u.last_name) as changed_by_name
            FROM thesis_status_history tsh
            LEFT JOIN users u ON tsh.changed_by = u.id
            WHERE tsh.thesis_id = $1
            ORDER BY tsh.changed_at DESC
        `, [thesis.rows[0].id]);

        res.json({
            thesis: thesis.rows[0],
            status_history: statusHistory.rows
        });

    } catch (error) {
        console.error('Get thesis details error:', error);
        res.status(500).json({ message: 'Failed to load thesis details' });
    }
});

/**
 * 📊 GET /api/student/available-professors - Διαθέσιμοι καθηγητές για τριμελή
 */
router.get('/available-professors', async (req, res) => {
    try {
        const studentId = req.userProfile.student_id;
        
        // Βρες τον επιβλέποντα καθηγητή
        const supervisorResult = await pool.query(`
            SELECT tw.supervisor_id 
            FROM thesis_works tw 
            WHERE tw.student_id = $1 AND tw.status = 'under_assignment'
        `, [studentId]);

        if (supervisorResult.rows.length === 0) {
            return res.status(400).json({ message: 'No thesis under assignment found' });
        }

        const supervisorId = supervisorResult.rows[0].supervisor_id;

        // Βρες όλους τους καθηγητές εκτός από τον επιβλέποντα
        const professors = await pool.query(`
            SELECT 
                p.id,
                u.first_name,
                u.last_name,
                p.specialization,
                p.office_location
            FROM professors p
            JOIN users u ON p.user_id = u.id
            WHERE p.id != $1 AND u.is_active = true
            ORDER BY u.last_name, u.first_name
        `, [supervisorId]);

        res.json({ professors: professors.rows });

    } catch (error) {
        console.error('Get available professors error:', error);
        res.status(500).json({ message: 'Failed to load professors' });
    }
});


/**
 * 🔄 PUT /api/student/thesis/request-examination - Request examination
 */
router.put('/thesis/request-examination', async (req, res) => {
    try {
        const studentId = req.userProfile.student_id;
        
        // Find student's active thesis
        const thesis = await pool.query(`
            SELECT id, status, supervisor_id 
            FROM thesis_works 
            WHERE student_id = $1 AND status = 'active'
        `, [studentId]);

        if (thesis.rows.length === 0) {
            return res.status(404).json({ 
                message: 'No active thesis found for examination request' 
            });
        }

        // Create a status change request (for professor approval)
        await pool.query(`
            INSERT INTO thesis_status_history (thesis_id, from_status, to_status, changed_by, change_reason)
            VALUES ($1, 'active', 'under_examination', $2, 'Student requested examination')
        `, [thesis.rows[0].id, req.session.user.id]);

        res.json({ 
            message: 'Examination request submitted successfully',
            thesis_id: thesis.rows[0].id 
        });

    } catch (error) {
        console.error('Request examination error:', error);
        res.status(500).json({ message: 'Failed to submit examination request' });
    }
});

/**
 * 📊 GET /api/student/thesis/status-history - Get thesis status history
 */
router.get('/thesis/status-history', async (req, res) => {
    try {
        const studentId = req.userProfile.student_id;
        
        // Get status history for student's thesis
        const history = await pool.query(`
            SELECT 
                tsh.from_status,
                tsh.to_status,
                tsh.change_reason,
                tsh.changed_at,
                CONCAT(u.first_name, ' ', u.last_name) as changed_by_name,
                u.user_type as changed_by_type
            FROM thesis_status_history tsh
            JOIN thesis_works tw ON tsh.thesis_id = tw.id
            LEFT JOIN users u ON tsh.changed_by = u.id
            WHERE tw.student_id = $1
            ORDER BY tsh.changed_at DESC
        `, [studentId]);

        res.json({ status_history: history.rows });

    } catch (error) {
        console.error('Get status history error:', error);
        res.status(500).json({ message: 'Failed to load status history' });
    }
});

module.exports = router;