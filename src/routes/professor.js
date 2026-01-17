// src/routes/professor.js - Complete Routes για καθηγητές
const express = require('express');
const { pool } = require('../config/database');
const { requireAuth, requireProfessor, getCurrentUserProfile } = require('../middleware/auth');

const router = express.Router();

// Middleware για όλα τα professor routes
router.use(requireAuth);
router.use(requireProfessor);
router.use(getCurrentUserProfile);

/**
 * 📋 GET /api/professor/dashboard - Complete Dashboard data για καθηγητή
 */
router.get('/dashboard', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        
        if (!professorId) {
            return res.status(404).json({ 
                success: false,
                message: 'Professor profile not found' 
            });
        }

        // Στατιστικά ως επιβλέπων καθηγητής
        const supervisorStats = await pool.query(`
            SELECT 
                COUNT(CASE WHEN tw.status = 'under_assignment' THEN 1 END) as under_assignment,
                COUNT(CASE WHEN tw.status = 'active' THEN 1 END) as active,
                COUNT(CASE WHEN tw.status = 'under_examination' THEN 1 END) as under_examination,
                COUNT(CASE WHEN tw.status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN tw.status = 'cancelled' THEN 1 END) as cancelled,
                COUNT(*) as total_supervised,
                AVG(CASE WHEN tw.status = 'completed' AND tw.final_grade IS NOT NULL 
                    THEN tw.final_grade END) as avg_grade,
                AVG(CASE WHEN tw.status = 'completed' AND tw.completed_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (tw.completed_at - tw.activated_at))/2629746 
                    END) as avg_completion_months
            FROM thesis_works tw
            WHERE tw.supervisor_id = $1
        `, [professorId]);

        // Στατιστικά ως μέλος επιτροπής
        const committeeStats = await pool.query(`
            SELECT 
                COUNT(*) as total_committee_participations,
                COUNT(CASE WHEN tw.status = 'completed' THEN 1 END) as completed_as_member
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            WHERE tcm.professor_id = $1 AND tcm.status = 'accepted'
        `, [professorId]);

        // Διαθέσιμα θέματα που έχει δημιουργήσει
        const availableTopics = await pool.query(`
            SELECT 
                id,
                title,
                description,
                detailed_description_file,
                is_available,
                created_at
            FROM thesis_topics
            WHERE supervisor_id = $1 AND is_available = true
            ORDER BY created_at DESC
        `, [professorId]);

        // Πρόσφατες διπλωματικές που επιβλέπει
        const supervisedTheses = await pool.query(`
            SELECT 
                tw.id,
                tw.status,
                tw.assigned_at,
                tw.activated_at,
                tw.examination_started_at,
                tw.updated_at,
                tt.title as topic_title,
                CONCAT(student_user.first_name, ' ', student_user.last_name) as student_name,
                s.student_id as student_number,
                s.phone_mobile as student_phone,
                s.contact_email as student_email
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students s ON tw.student_id = s.id
            JOIN users student_user ON s.user_id = student_user.id
            WHERE tw.supervisor_id = $1
            ORDER BY tw.updated_at DESC
        `, [professorId]);

        // Προσκλήσεις σε επιτροπές που εκκρεμούν
        const pendingInvitations = await pool.query(`
            SELECT 
                tcm.id as invitation_id,
                tcm.thesis_id,
                tcm.invited_at,
                tt.title as thesis_title,
                tt.description as thesis_description,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name,
                CONCAT(student_user.first_name, ' ', student_user.last_name) as student_name,
                s.student_id as student_number
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            JOIN students s ON tw.student_id = s.id
            JOIN users student_user ON s.user_id = student_user.id
            WHERE tcm.professor_id = $1 AND tcm.status = 'pending'
            ORDER BY tcm.invited_at DESC
        `, [professorId]);

        // Θέσεις σε επιτροπές που έχει αποδεχτεί
        const committeeParticipations = await pool.query(`
            SELECT 
                tcm.thesis_id,
                tcm.role,
                tcm.responded_at,
                tt.title as thesis_title,
                tw.status as thesis_status,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name,
                CONCAT(student_user.first_name, ' ', student_user.last_name) as student_name,
                s.student_id as student_number
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            JOIN students s ON tw.student_id = s.id
            JOIN users student_user ON s.user_id = student_user.id
            WHERE tcm.professor_id = $1 AND tcm.status = 'accepted'
            ORDER BY tw.updated_at DESC
        `, [professorId]);

        res.json({
            success: true,
            data: {
                professor: {
                    id: professorId,
                    name: `${req.userProfile.first_name} ${req.userProfile.last_name}`,
                    email: req.userProfile.email,
                    office: req.userProfile.office_location,
                    phone: req.userProfile.phone,
                    specialization: req.userProfile.specialization
                },
                statistics: {
                    totalSupervised: parseInt(supervisorStats.rows[0].total_supervised) || 0,
                    activeTheses: parseInt(supervisorStats.rows[0].active) || 0,
                    completedTheses: parseInt(supervisorStats.rows[0].completed) || 0,
                    underAssignment: parseInt(supervisorStats.rows[0].under_assignment) || 0,
                    underExamination: parseInt(supervisorStats.rows[0].under_examination) || 0,
                    committeeParticipations: parseInt(committeeStats.rows[0].total_committee_participations) || 0,
                    avgGrade: parseFloat(supervisorStats.rows[0].avg_grade) || 0,
                    avgCompletionMonths: parseFloat(supervisorStats.rows[0].avg_completion_months) || 0
                },
                availableTopics: availableTopics.rows,
                supervisedTheses: supervisedTheses.rows,
                pendingInvitations: pendingInvitations.rows,
                committeeParticipations: committeeParticipations.rows
            }
        });

    } catch (error) {
        console.error('❌ Professor dashboard error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to load dashboard data',
            error: error.message 
        });
    }
});

/**
 * 📝 POST /api/professor/create-topic - Δημιουργία νέου θέματος
 */
router.post('/create-topic', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        const { title, description, detailed_description } = req.body;

        // Validation
        if (!title || title.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Ο τίτλος πρέπει να έχει τουλάχιστον 10 χαρακτήρες'
            });
        }

        if (!description || description.trim().length < 50) {
            return res.status(400).json({
                success: false,
                message: 'Η περιγραφή πρέπει να έχει τουλάχιστον 50 χαρακτήρες'
            });
        }

        // Create the topic
        const result = await pool.query(`
            INSERT INTO thesis_topics 
            (title, description, supervisor_id, is_available, created_at, updated_at)
            VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
        `, [title.trim(), description.trim(), professorId]);

        console.log('✅ Topic created successfully:', result.rows[0].id);

        res.json({
            success: true,
            message: 'Το θέμα δημιουργήθηκε επιτυχώς',
            topic: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Create topic error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά τη δημιουργία θέματος',
            error: error.message
        });
    }
});

/**
 * 🎯 POST /api/professor/assign-topic - Ανάθεση θέματος σε φοιτητή
 */
router.post('/assign-topic', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        const { topic_id, student_identifier } = req.body; // student_identifier can be student_id or student number

        // Find the student
        let student = null;
        
        // Try to find by student number first (AM)
        if (student_identifier && isNaN(student_identifier) === false) {
            const studentByNumber = await pool.query(`
                SELECT s.id, s.student_id, s.user_id,
                       CONCAT(u.first_name, ' ', u.last_name) as student_name,
                       u.email
                FROM students s
                JOIN users u ON s.user_id = u.id
                WHERE s.student_id = $1 AND u.is_active = true
            `, [student_identifier]);
            
            if (studentByNumber.rows.length > 0) {
                student = studentByNumber.rows[0];
            }
        }
        
        // If not found by number, try by name
        if (!student && student_identifier) {
            const studentByName = await pool.query(`
                SELECT s.id, s.student_id, s.user_id,
                       CONCAT(u.first_name, ' ', u.last_name) as student_name,
                       u.email
                FROM students s
                JOIN users u ON s.user_id = u.id
                WHERE (u.first_name ILIKE $1 OR u.last_name ILIKE $1 
                       OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $1)
                      AND u.is_active = true
                LIMIT 1
            `, [`%${student_identifier}%`]);
            
            if (studentByName.rows.length > 0) {
                student = studentByName.rows[0];
            }
        }

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Δεν βρέθηκε φοιτητής με αυτά τα στοιχεία'
            });
        }

        // Check if topic exists and belongs to this professor
        const topic = await pool.query(`
            SELECT id, title, is_available
            FROM thesis_topics
            WHERE id = $1 AND supervisor_id = $2
        `, [topic_id, professorId]);

        if (topic.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Το θέμα δεν βρέθηκε ή δεν σας ανήκει'
            });
        }

        if (!topic.rows[0].is_available) {
            return res.status(400).json({
                success: false,
                message: 'Το θέμα δεν είναι διαθέσιμο για ανάθεση'
            });
        }

        // Check if student already has an active thesis
        const existingThesis = await pool.query(`
            SELECT id, status
            FROM thesis_works
            WHERE student_id = $1 AND status IN ('under_assignment', 'active', 'under_examination')
        `, [student.id]);

        if (existingThesis.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ο φοιτητής έχει ήδη ενεργή διπλωματική εργασία'
            });
        }

        // Create the thesis assignment
        const thesisResult = await pool.query(`
            INSERT INTO thesis_works 
            (topic_id, student_id, supervisor_id, status, assigned_at, created_at, updated_at)
            VALUES ($1, $2, $3, 'under_assignment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
        `, [topic_id, student.id, professorId]);

        // Mark topic as unavailable
        await pool.query(`
            UPDATE thesis_topics 
            SET is_available = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [topic_id]);

        // Add supervisor to committee
        await pool.query(`
            INSERT INTO thesis_committee_members 
            (thesis_id, professor_id, role, status, invited_at, responded_at)
            VALUES ($1, $2, 'supervisor', 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [thesisResult.rows[0].id, professorId]);

        console.log('✅ Topic assigned successfully to student:', student.student_name);

        res.json({
            success: true,
            message: `Το θέμα ανατέθηκε επιτυχώς στον φοιτητή ${student.student_name}`,
            assignment: {
                thesis_id: thesisResult.rows[0].id,
                topic_title: topic.rows[0].title,
                student: student
            }
        });

    } catch (error) {
        console.error('❌ Assign topic error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την ανάθεση θέματος',
            error: error.message
        });
    }
});

/**
 * ✅ POST /api/professor/respond-invitation - Απόκριση σε πρόσκληση επιτροπής
 */
router.post('/respond-invitation', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        const { invitation_id, response } = req.body; // response: 'accept' or 'reject'

        if (!['accept', 'reject'].includes(response)) {
            return res.status(400).json({
                success: false,
                message: 'Η απάντηση πρέπει να είναι accept ή reject'
            });
        }

        // Verify invitation exists and is pending
        const invitation = await pool.query(`
            SELECT tcm.*, tw.status as thesis_status, tt.title as thesis_title
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            WHERE tcm.id = $1 AND tcm.professor_id = $2 AND tcm.status = 'pending'
        `, [invitation_id, professorId]);

        if (invitation.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Η πρόσκληση δεν βρέθηκε ή έχει ήδη απαντηθεί'
            });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Update invitation status
            const newStatus = response === 'accept' ? 'accepted' : 'rejected';
            await client.query(`
                UPDATE thesis_committee_members 
                SET status = $1, responded_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [newStatus, invitation_id]);

            // If accepted, check if we now have enough committee members
            if (response === 'accept') {
                const acceptedMembers = await client.query(`
                    SELECT COUNT(*) as count
                    FROM thesis_committee_members
                    WHERE thesis_id = $1 AND status = 'accepted'
                `, [invitation.rows[0].thesis_id]);

                // If we have 3 members (supervisor + 2 members), activate the thesis
                if (parseInt(acceptedMembers.rows[0].count) >= 3) {
                    await client.query(`
                        UPDATE thesis_works 
                        SET status = 'active', activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1 AND status = 'under_assignment'
                    `, [invitation.rows[0].thesis_id]);

                    // Cancel any other pending invitations for this thesis
                    await client.query(`
                        UPDATE thesis_committee_members 
                        SET status = 'rejected', responded_at = CURRENT_TIMESTAMP
                        WHERE thesis_id = $1 AND status = 'pending'
                    `, [invitation.rows[0].thesis_id]);
                }
            }

            await client.query('COMMIT');

            console.log(`✅ Invitation ${response}ed successfully`);

            res.json({
                success: true,
                message: response === 'accept' 
                    ? 'Η πρόσκληση έγινε αποδεκτή' 
                    : 'Η πρόσκληση απορρίφθηκε',
                response: response
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ Respond invitation error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την απόκριση πρόσκλησης',
            error: error.message
        });
    }
});

/**
 * 📝 POST /api/professor/add-note - Προσθήκη σημείωσης για διπλωματική
 */
router.post('/add-note', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        const { thesis_id, note_text } = req.body;

        // Validate note length
        if (!note_text || note_text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Η σημείωση δεν μπορεί να είναι κενή'
            });
        }

        if (note_text.length > 300) {
            return res.status(400).json({
                success: false,
                message: 'Η σημείωση δεν μπορεί να υπερβαίνει τους 300 χαρακτήρες'
            });
        }

        // Verify professor has access to this thesis
        const accessCheck = await pool.query(`
            SELECT tw.id
            FROM thesis_works tw
            LEFT JOIN thesis_committee_members tcm ON tw.id = tcm.thesis_id
            WHERE tw.id = $1 
            AND (tw.supervisor_id = $2 OR (tcm.professor_id = $2 AND tcm.status = 'accepted'))
        `, [thesis_id, professorId]);

        if (accessCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη διπλωματική'
            });
        }

        // Add the note
        const result = await pool.query(`
            INSERT INTO thesis_notes 
            (thesis_id, professor_id, note_text, created_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            RETURNING *
        `, [thesis_id, professorId, note_text.trim()]);

        console.log('✅ Note added successfully');

        res.json({
            success: true,
            message: 'Η σημείωση προστέθηκε επιτυχώς',
            note: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Add note error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την προσθήκη σημείωσης',
            error: error.message
        });
    }
});

/**
 * 📋 GET /api/professor/thesis/:id - Λεπτομέρειες συγκεκριμένης διπλωματικής
 */
router.get('/thesis/:id', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        const thesisId = req.params.id;

        // Get thesis details with access check
        const thesis = await pool.query(`
            SELECT 
                tw.*,
                tt.title,
                tt.description,
                tt.detailed_description_file,
                CONCAT(student_user.first_name, ' ', student_user.last_name) as student_name,
                s.student_id as student_number,
                s.phone_mobile,
                s.contact_email,
                s.address,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name,
                (tw.supervisor_id = $2) as is_supervisor
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students s ON tw.student_id = s.id
            JOIN users student_user ON s.user_id = student_user.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            LEFT JOIN thesis_committee_members tcm ON tw.id = tcm.thesis_id AND tcm.professor_id = $2
            WHERE tw.id = $1 
            AND (tw.supervisor_id = $2 OR (tcm.professor_id = $2 AND tcm.status = 'accepted'))
        `, [thesisId, professorId]);

        if (thesis.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Η διπλωματική δεν βρέθηκε ή δεν έχετε πρόσβαση'
            });
        }

        // Get committee members
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
        `, [thesisId]);

        // Get notes by this professor
        const notes = await pool.query(`
            SELECT 
                id,
                note_text,
                created_at
            FROM thesis_notes
            WHERE thesis_id = $1 AND professor_id = $2
            ORDER BY created_at DESC
        `, [thesisId, professorId]);

        // Get files if thesis is under examination or completed
        let files = [];
        if (['under_examination', 'completed'].includes(thesis.rows[0].status)) {
            const filesResult = await pool.query(`
                SELECT 
                    id,
                    file_name,
                    file_type,
                    uploaded_at
                FROM thesis_files
                WHERE thesis_id = $1
                ORDER BY uploaded_at DESC
            `, [thesisId]);
            files = filesResult.rows;
        }

        res.json({
            success: true,
            thesis: thesis.rows[0],
            committee: committee.rows,
            notes: notes.rows,
            files: files
        });

    } catch (error) {
        console.error('❌ Get thesis details error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά τη φόρτωση λεπτομερειών',
            error: error.message
        });
    }
});

/**
 * 🔄 POST /api/professor/change-thesis-status - Αλλαγή κατάστασης διπλωματικής
 */
router.post('/change-thesis-status', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;
        const { thesis_id, new_status, reason } = req.body;

        // Verify this professor is the supervisor
        const thesis = await pool.query(`
            SELECT tw.*, tt.title
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            WHERE tw.id = $1 AND tw.supervisor_id = $2
        `, [thesis_id, professorId]);

        if (thesis.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Η διπλωματική δεν βρέθηκε ή δεν είστε ο επιβλέπων'
            });
        }

        const currentStatus = thesis.rows[0].status;
        const validTransitions = {
            'under_assignment': ['cancelled'],
            'active': ['under_examination', 'cancelled'],
            'under_examination': ['completed'],
            'completed': [],
            'cancelled': []
        };

        if (!validTransitions[currentStatus].includes(new_status)) {
            return res.status(400).json({
                success: false,
                message: `Δεν επιτρέπεται η αλλαγή από ${currentStatus} σε ${new_status}`
            });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Update thesis status
            let updateQuery = `
                UPDATE thesis_works 
                SET status = $1, updated_at = CURRENT_TIMESTAMP
            `;
            const params = [new_status];

            if (new_status === 'under_examination') {
                updateQuery += `, examination_started_at = CURRENT_TIMESTAMP`;
            } else if (new_status === 'completed') {
                updateQuery += `, completed_at = CURRENT_TIMESTAMP`;
            } else if (new_status === 'cancelled') {
                updateQuery += `, cancelled_at = CURRENT_TIMESTAMP, cancelled_by = 'professor', cancellation_reason = $3`;
                params.push(reason || 'Cancelled by supervisor');
            }

            updateQuery += ` WHERE id = $2`;
            params.splice(1, 0, thesis_id);

            await client.query(updateQuery, params);

            // Record status change in history
            await client.query(`
                INSERT INTO thesis_status_history 
                (thesis_id, from_status, to_status, changed_by, change_reason, changed_at)
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            `, [thesis_id, currentStatus, new_status, req.user.id, reason || `Status changed to ${new_status} by supervisor`]);

            await client.query('COMMIT');

            console.log(`✅ Thesis status changed from ${currentStatus} to ${new_status}`);

            res.json({
                success: true,
                message: `Η κατάσταση άλλαξε επιτυχώς σε ${new_status}`,
                from_status: currentStatus,
                to_status: new_status
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ Change thesis status error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την αλλαγή κατάστασης',
            error: error.message
        });
    }
});

/**
 * 📊 GET /api/professor/statistics - Στατιστικά επιδόσεων
 */
router.get('/statistics', async (req, res) => {
    try {
        const professorId = req.userProfile.professor_id;

        // Monthly completion statistics
        const monthlyStats = await pool.query(`
            SELECT 
                EXTRACT(YEAR FROM completed_at) as year,
                EXTRACT(MONTH FROM completed_at) as month,
                COUNT(*) as completions,
                AVG(final_grade) as avg_grade
            FROM thesis_works
            WHERE supervisor_id = $1 AND status = 'completed' 
            AND completed_at >= CURRENT_DATE - INTERVAL '2 years'
            GROUP BY EXTRACT(YEAR FROM completed_at), EXTRACT(MONTH FROM completed_at)
            ORDER BY year, month
        `, [professorId]);

        // Grade distribution
        const gradeDistribution = await pool.query(`
            SELECT 
                CASE 
                    WHEN final_grade >= 8.5 THEN 'Άριστα (8.5-10)'
                    WHEN final_grade >= 6.5 THEN 'Καλώς (6.5-8.4)'
                    WHEN final_grade >= 5.0 THEN 'Μετρίως (5.0-6.4)'
                    ELSE 'Ανεπαρκώς (<5.0)'
                END as grade_category,
                COUNT(*) as count
            FROM thesis_works
            WHERE supervisor_id = $1 AND status = 'completed' AND final_grade IS NOT NULL
            GROUP BY grade_category
            ORDER BY MIN(final_grade) DESC
        `, [professorId]);

        // Average completion time by year
        const completionTimes = await pool.query(`
            SELECT 
                EXTRACT(YEAR FROM completed_at) as year,
                AVG(EXTRACT(EPOCH FROM (completed_at - activated_at))/2629746) as avg_months
            FROM thesis_works
            WHERE supervisor_id = $1 AND status = 'completed' 
            AND completed_at IS NOT NULL AND activated_at IS NOT NULL
            GROUP BY EXTRACT(YEAR FROM completed_at)
            ORDER BY year
        `, [professorId]);

        res.json({
            success: true,
            statistics: {
                monthlyCompletions: monthlyStats.rows,
                gradeDistribution: gradeDistribution.rows,
                completionTimes: completionTimes.rows
            }
        });

    } catch (error) {
        console.error('❌ Get statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά τη φόρτωση στατιστικών',
            error: error.message
        });
    }
});

module.exports = router;