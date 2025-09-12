
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


// PRESENTATION SCHEDULING - POST /api/student/schedule-presentation



router.post('/schedule-presentation', async (req, res) => {
    try {
        const { thesis_id, presentation_date, examination_type, room_location, meeting_link } = req.body;
        const student_id = req.userProfile.student_id;

        console.log('📅 Schedule presentation request:', { thesis_id, examination_type, student_id });

        // Validation: Check if this student owns this thesis
        const thesisCheck = await pool.query(
            'SELECT id FROM thesis_works WHERE id = $1 AND student_id = $2',
            [thesis_id, student_id]
        );

        if (thesisCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη διπλωματική' 
            });
        }

        // Check if presentation already scheduled (update vs insert)
        const existing = await pool.query(
            'SELECT id FROM thesis_presentations WHERE thesis_id = $1',
            [thesis_id]
        );

        let result;
        if (existing.rows.length > 0) {
            // Update existing presentation
            result = await pool.query(
                `UPDATE thesis_presentations 
                 SET presentation_date = $1, examination_type = $2, 
                     room_location = $3, meeting_link = $4, updated_at = CURRENT_TIMESTAMP
                 WHERE thesis_id = $5 
                 RETURNING *`,
                [presentation_date, examination_type, room_location, meeting_link, thesis_id]
            );
        } else {
            // Insert new presentation
            result = await pool.query(
                `INSERT INTO thesis_presentations 
                 (thesis_id, presentation_date, examination_type, room_location, meeting_link)
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING *`,
                [thesis_id, presentation_date, examination_type, room_location, meeting_link]
            );
        }

        console.log('✅ Presentation scheduled successfully:', result.rows[0]);

        res.json({
            success: true,
            message: 'Η παρουσίαση καταχωρήθηκε επιτυχώς',
            presentation: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Schedule presentation error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την καταχώρηση παρουσίασης',
            error: error.message
        });
    }
});


//  EXTERNAL LINKS MANAGEMENT - Multiple endpoints for CRUD operations


//  ADD EXTERNAL LINK - POST /api/student/add-external-link
router.post('/add-external-link', async (req, res) => {
    try {
        const { thesis_id, link_url, link_description } = req.body;
        const student_id = req.userProfile.student_id;
        const user_id = req.user.id;

        console.log('🔗 Add external link request:', { thesis_id, link_description, student_id });

        // Validation: Check if this student owns this thesis
        const thesisCheck = await pool.query(
            'SELECT id FROM thesis_works WHERE id = $1 AND student_id = $2',
            [thesis_id, student_id]
        );

        if (thesisCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη διπλωματική' 
            });
        }

        // Insert the new link
        const result = await pool.query(
            `INSERT INTO thesis_external_links 
             (thesis_id, link_url, link_description, added_by)
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [thesis_id, link_url, link_description, user_id]
        );

        console.log('✅ External link added successfully:', result.rows[0]);

        res.json({
            success: true,
            message: 'Ο σύνδεσμος προστέθηκε επιτυχώς',
            link: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Add external link error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την προσθήκη συνδέσμου',
            error: error.message
        });
    }
});

//  GET EXTERNAL LINKS - GET /api/student/external-links/:thesisId
router.get('/external-links/:thesisId', async (req, res) => {
    try {
        const thesisId = req.params.thesisId;
        const student_id = req.userProfile.student_id;

        console.log('📄 Get external links request:', { thesisId, student_id });

        // Validation: Check if this student owns this thesis
        const thesisCheck = await pool.query(
            'SELECT id FROM thesis_works WHERE id = $1 AND student_id = $2',
            [thesisId, student_id]
        );

        if (thesisCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη διπλωματική' 
            });
        }

        // Get all links for this thesis
        const result = await pool.query(
            `SELECT tel.*, u.first_name, u.last_name
             FROM thesis_external_links tel
             LEFT JOIN users u ON tel.added_by = u.id
             WHERE tel.thesis_id = $1
             ORDER BY tel.added_at DESC`,
            [thesisId]
        );

        console.log(`✅ Retrieved ${result.rows.length} external links`);

        res.json(result.rows);

    } catch (error) {
        console.error('❌ Get external links error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά τη φόρτωση συνδέσμων',
            error: error.message
        });
    }
});

//  DELETE EXTERNAL LINK - DELETE /api/student/external-links/:linkId
router.delete('/external-links/:linkId', async (req, res) => {
    try {
        const linkId = req.params.linkId;
        const student_id = req.userProfile.student_id;

        console.log('🗑️ Delete external link request:', { linkId, student_id });

        // Validation: Check if this link belongs to a thesis owned by this student
        const linkCheck = await pool.query(
            `SELECT tel.id, tw.student_id
             FROM thesis_external_links tel
             JOIN thesis_works tw ON tel.thesis_id = tw.id
             WHERE tel.id = $1`,
            [linkId]
        );

        if (linkCheck.rows.length === 0 || linkCheck.rows[0].student_id !== student_id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Δεν έχετε δικαίωμα διαγραφής αυτού του συνδέσμου' 
            });
        }

        // Delete the link
        await pool.query('DELETE FROM thesis_external_links WHERE id = $1', [linkId]);

        console.log('✅ External link deleted successfully');

        res.json({
            success: true,
            message: 'Ο σύνδεσμος διαγράφηκε επιτυχώς'
        });

    } catch (error) {
        console.error('❌ Delete external link error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά τη διαγραφή συνδέσμου',
            error: error.message
        });
    }
});


//  REPOSITORY MANAGEMENT - POST /api/student/update-repository

router.post('/update-repository', async (req, res) => {
    try {
        const { thesis_id, repository_link } = req.body;
        const student_id = req.userProfile.student_id;

        console.log('📚 Update repository request:', { thesis_id, student_id });

        // Validation: Check if this student owns this thesis
        const thesisCheck = await pool.query(
            'SELECT id FROM thesis_works WHERE id = $1 AND student_id = $2',
            [thesis_id, student_id]
        );

        if (thesisCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη διπλωματική' 
            });
        }

        // Update the repository link
        const result = await pool.query(
            'UPDATE thesis_works SET repository_link = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [repository_link, thesis_id]
        );

        console.log('✅ Repository link updated successfully');

        res.json({
            success: true,
            message: 'Ο σύνδεσμος αποθετηρίου ενημερώθηκε επιτυχώς',
            thesis: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Update repository error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την ενημέρωση αποθετηρίου',
            error: error.message
        });
    }
});

//  PROFILE MANAGEMENT - POST /api/student/update-profile

router.post('/update-profile', async (req, res) => {
    try {
        const { phone_mobile, phone_landline, address, contact_email } = req.body;
        const student_id = req.userProfile.student_id;

        console.log('👤 Update profile request:', { student_id });

        // Update the student profile
        const result = await pool.query(
            `UPDATE students 
             SET phone_mobile = $1, phone_landline = $2, address = $3, 
                 contact_email = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 
             RETURNING *`,
            [phone_mobile, phone_landline, address, contact_email, student_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Το προφίλ φοιτητή δεν βρέθηκε'
            });
        }

        console.log('✅ Profile updated successfully');

        res.json({
            success: true,
            message: 'Το προφίλ ενημερώθηκε επιτυχώς',
            student: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την ενημέρωση προφίλ',
            error: error.message
        });
    }
});


//  EXAM REPORT VIEW - GET /api/student/exam-report/:thesisId

router.get('/exam-report/:thesisId', async (req, res) => {
    try {
        const thesisId = req.params.thesisId;
        const student_id = req.userProfile.student_id;

        console.log('📋 Exam report request:', { thesisId, student_id });

        // Validation: Check if this student owns this thesis and it's completed
        const thesisCheck = await pool.query(
            `SELECT tw.*, tt.title, tt.description,
                    CONCAT(supervisor.first_name, ' ', supervisor.last_name) as supervisor_name
             FROM thesis_works tw
             JOIN thesis_topics tt ON tw.topic_id = tt.id
             JOIN professors p ON tw.supervisor_id = p.id
             JOIN users supervisor ON p.user_id = supervisor.id
             WHERE tw.id = $1 AND tw.student_id = $2 AND tw.status = 'completed'`,
            [thesisId, student_id]
        );

        if (thesisCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Η διπλωματική δεν βρέθηκε ή δεν έχει ολοκληρωθεί' 
            });
        }

        const thesis = thesisCheck.rows[0];

        // Get committee members and grades
        const committeeResult = await pool.query(
            `SELECT tcm.*, 
                    CONCAT(u.first_name, ' ', u.last_name) as professor_name,
                    tg.total_grade, tg.comments
             FROM thesis_committee_members tcm
             JOIN professors prof ON tcm.professor_id = prof.id
             JOIN users u ON prof.user_id = u.id
             LEFT JOIN thesis_grades tg ON tg.thesis_id = tcm.thesis_id AND tg.professor_id = tcm.professor_id
             WHERE tcm.thesis_id = $1 AND tcm.status = 'accepted'
             ORDER BY tcm.role DESC, tcm.id`,
            [thesisId]
        );

        // Generate HTML report (simple version)
        const reportHtml = `
        <!DOCTYPE html>
        <html lang="el">
        <head>
            <meta charset="UTF-8">
            <title>Πρακτικό Εξέτασης - ${thesis.title}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 2rem; line-height: 1.6; }
                .header { text-align: center; margin-bottom: 2rem; }
                .section { margin: 1rem 0; }
                .grade { font-weight: bold; color: #2d5aa0; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>ΠΡΑΚΤΙΚΟ ΕΞΕΤΑΣΗΣ ΔΙΠΛΩΜΑΤΙΚΗΣ ΕΡΓΑΣΙΑΣ</h1>
                <h2>Πανεπιστήμιο Πατρών - Τμήμα Μηχανικών Η/Υ & Πληροφορικής</h2>
            </div>
            
            <div class="section">
                <h3>Στοιχεία Διπλωματικής</h3>
                <p><strong>Τίτλος:</strong> ${thesis.title}</p>
                <p><strong>Φοιτητής:</strong> ${req.userProfile.first_name} ${req.userProfile.last_name}</p>
                <p><strong>Επιβλέπων:</strong> ${thesis.supervisor_name}</p>
                <p><strong>Ημερομηνία Ολοκλήρωσης:</strong> ${new Date(thesis.completed_at).toLocaleDateString('el-GR')}</p>
            </div>
            
            <div class="section">
                <h3>Επιτροπή Εξέτασης</h3>
                ${committeeResult.rows.map(member => `
                    <p><strong>${member.professor_name}</strong> (${member.role === 'supervisor' ? 'Επιβλέπων' : 'Μέλος'})
                    ${member.total_grade ? `<span class="grade">- Βαθμός: ${member.total_grade}/10</span>` : ''}</p>
                `).join('')}
            </div>
            
            <div class="section">
                <h3>Τελικός Βαθμός</h3>
                <p class="grade" style="font-size: 1.2em;">${thesis.final_grade}/10</p>
            </div>
        </body>
        </html>
        `;

        res.send(reportHtml);

    } catch (error) {
        console.error('❌ Exam report error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά τη δημιουργία πρακτικού',
            error: error.message
        });
    }
});


module.exports = router;