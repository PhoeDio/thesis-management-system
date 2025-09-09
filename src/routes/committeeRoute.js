// src/routes/committee.js
// This file handles all committee-related workflow operations

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');

/*
 * COMMITTEE INVITATION SYSTEM
 * This section handles the process of building thesis committees
 * 
 * Think of this like organizing a dinner party: you need to send invitations,
 * track RSVPs, and only start the party when enough people have confirmed.
 * But unlike a dinner party, academic committees have strict rules about
 * who can participate and how many people are needed.
 */

/**
 * Send committee invitations for a thesis
 * POST /api/committee/thesis/:thesisId/invite
 * 
 * This endpoint allows a supervising professor to invite other faculty
 * members to join a thesis committee. It's like sending wedding invitations -
 * you need to track who you've invited and wait for their responses.
 * 
 * Body expected:
 * {
 *   professorIds: [2, 3], // Array of professor user IDs to invite
 *   message: "Would you like to join this committee?" // Optional invitation message
 * }
 */
router.post('/thesis/:thesisId/invite', requireAuth, requireRole(['professor']), async (req, res) => {
    const { thesisId } = req.params;
    const { professorIds, message } = req.body;
    const supervisorId = req.user.id;

    // Input validation - we need to be strict about what data we accept
    if (!professorIds || !Array.isArray(professorIds) || professorIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Πρέπει να επιλέξετε τουλάχιστον έναν καθηγητή για πρόσκληση'
        });
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // First, verify that the requesting user is actually the supervisor of this thesis
        // This is like checking that you're the host before you send party invitations
        const thesisCheck = await client.query(`
            SELECT tw.id, tw.supervisor_id, tw.status, tt.title
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            WHERE tw.id = $1 AND tw.supervisor_id = $2
        `, [thesisId, supervisorId]);

        if (thesisCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                message: 'Δεν έχετε δικαίωμα να προσκαλέσετε μέλη για αυτή τη διπλωματική εργασία'
            });
        }

        const thesis = thesisCheck.rows[0];

        // Check if thesis is in the right status for committee formation
        // You can't invite people to a committee if the thesis is already completed
        if (!['under_assignment', 'active'].includes(thesis.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Δεν μπορείτε να προσκαλέσετε μέλη επιτροπής σε αυτή την κατάσταση της διπλωματικής'
            });
        }

        // Verify that all invited professors actually exist and are active
        // This prevents inviting non-existent or inactive faculty members
        const professorsCheck = await client.query(`
            SELECT u.id, u.first_name, u.last_name, u.email
            FROM users u
            WHERE u.id = ANY($1) AND u.user_type = 'professor' AND u.is_active = true
        `, [professorIds]);

        if (professorsCheck.rows.length !== professorIds.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Κάποιοι από τους επιλεγμένους καθηγητές δεν είναι έγκυροι ή ενεργοί'
            });
        }

        // Check for existing invitations to avoid duplicate invitations
        // It's rude to invite someone twice to the same committee
        const existingInvitations = await client.query(`
            SELECT professor_id
            FROM thesis_committee_members
            WHERE thesis_id = $1 AND professor_id = ANY($2)
        `, [thesisId, professorIds]);

        const alreadyInvitedIds = existingInvitations.rows.map(row => row.professor_id);
        const newInvitationIds = professorIds.filter(id => !alreadyInvitedIds.includes(id));

        if (newInvitationIds.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Όλοι οι επιλεγμένοι καθηγητές έχουν ήδη προσκληθεί σε αυτή την επιτροπή'
            });
        }

        // Create invitation records for each new invitation
        // Each invitation is like a formal invitation card with all the details
        const invitationPromises = newInvitationIds.map(professorId => {
            return client.query(`
                INSERT INTO thesis_committee_members 
                (thesis_id, professor_id, role, status, invited_at)
                VALUES ($1, $2, 'member', 'pending', CURRENT_TIMESTAMP)
                RETURNING id
            `, [thesisId, professorId]);
        });

        const invitationResults = await Promise.all(invitationPromises);

        // Record this action in the thesis status history
        // This creates an audit trail of all committee-related actions
        await client.query(`
            INSERT INTO thesis_status_history 
            (thesis_id, from_status, to_status, changed_by, change_reason, changed_at)
            VALUES ($1, $2, $2, $3, $4, CURRENT_TIMESTAMP)
        `, [
            thesisId, 
            thesis.status, 
            supervisorId, 
            `Προσκλήθηκαν ${newInvitationIds.length} μέλη επιτροπής`
        ]);

        await client.query('COMMIT');

        // Return success response with details about what happened
        res.json({
            success: true,
            message: `Εστάλησαν ${newInvitationIds.length} προσκλήσεις επιτροπής επιτυχώς`,
            data: {
                thesisId: parseInt(thesisId),
                invitedProfessors: professorsCheck.rows.filter(prof => newInvitationIds.includes(prof.id)),
                invitationIds: invitationResults.map(result => result.rows[0].id),
                alreadyInvited: alreadyInvitedIds.length
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Committee invitation error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την αποστολή προσκλήσεων επιτροπής'
        });
    } finally {
        client.release();
    }
});

/**
 * Respond to a committee invitation
 * PUT /api/committee/invitation/:invitationId/respond
 * 
 * This endpoint allows an invited professor to accept or reject a committee invitation.
 * It's like RSVPing to a wedding - you need to let the host know whether you're coming.
 * 
 * Body expected:
 * {
 *   response: "accepted" | "rejected",
 *   message: "I'd be happy to serve on this committee" // Optional response message
 * }
 */
router.put('/invitation/:invitationId/respond', requireAuth, requireRole(['professor']), async (req, res) => {
    const { invitationId } = req.params;
    const { response, message } = req.body;
    const professorId = req.user.id;

    // Validate the response - only accept specific values
    if (!['accepted', 'rejected'].includes(response)) {
        return res.status(400).json({
            success: false,
            message: 'Η απάντηση πρέπει να είναι "accepted" ή "rejected"'
        });
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Verify that this invitation exists and belongs to the requesting professor
        // You can only RSVP to invitations that were actually sent to you
        const invitationCheck = await client.query(`
            SELECT tcm.*, tw.supervisor_id, tt.title, tw.status,
                   u.first_name as supervisor_first_name, u.last_name as supervisor_last_name
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN users u ON tw.supervisor_id = u.id
            WHERE tcm.id = $1 AND tcm.professor_id = $2
        `, [invitationId, professorId]);

        if (invitationCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Η πρόσκληση δεν βρέθηκε ή δεν ανήκει σε εσάς'
            });
        }

        const invitation = invitationCheck.rows[0];

        // Check if the invitation is still pending
        // You can't change your RSVP once you've already responded
        if (invitation.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Έχετε ήδη απαντήσει σε αυτή την πρόσκληση'
            });
        }

        // Update the invitation status
        await client.query(`
            UPDATE thesis_committee_members 
            SET status = $1, responded_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [response, invitationId]);

        // Record this action in the thesis status history
        await client.query(`
            INSERT INTO thesis_status_history 
            (thesis_id, from_status, to_status, changed_by, change_reason, changed_at)
            VALUES ($1, $2, $2, $3, $4, CURRENT_TIMESTAMP)
        `, [
            invitation.thesis_id, 
            invitation.status, 
            professorId, 
            `Μέλος επιτροπής ${response === 'accepted' ? 'αποδέχθηκε' : 'απέρριψε'} την πρόσκληση`
        ]);

        // Check if the committee is now complete (if all pending invitations are resolved)
        // This is like checking if you have enough RSVPs to hold your event
        const committeeStatus = await client.query(`
            SELECT 
                COUNT(*) as total_members,
                COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_members,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_members
            FROM thesis_committee_members 
            WHERE thesis_id = $1
        `, [invitation.thesis_id]);

        const stats = committeeStatus.rows[0];
        const committeeComplete = stats.pending_members == 0 && stats.accepted_members >= 2; // Minimum committee size

        // If committee is complete and thesis is still under assignment, activate it
        // This is the moment when all the pieces fall into place and the thesis can officially begin
        if (committeeComplete && invitation.status === 'under_assignment') {
            await client.query(`
                UPDATE thesis_works 
                SET status = 'active', activated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [invitation.thesis_id]);

            await client.query(`
                INSERT INTO thesis_status_history 
                (thesis_id, from_status, to_status, changed_by, change_reason, changed_at)
                VALUES ($1, 'under_assignment', 'active', $2, 'Η επιτροπή ολοκληρώθηκε επιτυχώς', CURRENT_TIMESTAMP)
            `, [invitation.thesis_id, invitation.supervisor_id]);
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: `Η πρόσκληση ${response === 'accepted' ? 'αποδέχθηκε' : 'απορρίφθηκε'} επιτυχώς`,
            data: {
                invitationId: parseInt(invitationId),
                response: response,
                thesisTitle: invitation.title,
                supervisorName: `${invitation.supervisor_first_name} ${invitation.supervisor_last_name}`,
                committeeComplete: committeeComplete,
                committeeStats: {
                    totalMembers: parseInt(stats.total_members),
                    acceptedMembers: parseInt(stats.accepted_members),
                    pendingMembers: parseInt(stats.pending_members)
                }
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Committee response error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την απάντηση στην πρόσκληση'
        });
    } finally {
        client.release();
    }
});

/**
 * Get committee invitations for the current professor
 * GET /api/committee/my-invitations
 * 
 * This endpoint returns all pending and responded invitations for the logged-in professor.
 * It's like checking your mailbox for party invitations.
 */
router.get('/my-invitations', requireAuth, requireRole(['professor']), async (req, res) => {
    const professorId = req.user.id;

    try {
        const invitations = await pool.query(`
            SELECT 
                tcm.id as invitation_id,
                tcm.status as invitation_status,
                tcm.invited_at,
                tcm.responded_at,
                tcm.role,
                tw.id as thesis_id,
                tt.title as thesis_title,
                tt.description as thesis_description,
                u.first_name as supervisor_first_name,
                u.last_name as supervisor_last_name,
                u.email as supervisor_email,
                s.first_name as student_first_name,
                s.last_name as student_last_name,
                st.student_id
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN users u ON tw.supervisor_id = u.id
            JOIN users s ON tw.student_id = s.id
            LEFT JOIN students st ON s.id = st.user_id
            WHERE tcm.professor_id = $1
            ORDER BY tcm.invited_at DESC
        `, [professorId]);

        res.json({
            success: true,
            data: {
                invitations: invitations.rows.map(row => ({
                    invitationId: row.invitation_id,
                    status: row.invitation_status,
                    invitedAt: row.invited_at,
                    respondedAt: row.responded_at,
                    role: row.role,
                    thesis: {
                        id: row.thesis_id,
                        title: row.thesis_title,
                        description: row.thesis_description,
                        supervisor: {
                            name: `${row.supervisor_first_name} ${row.supervisor_last_name}`,
                            email: row.supervisor_email
                        },
                        student: {
                            name: `${row.student_first_name} ${row.student_last_name}`,
                            studentId: row.student_id
                        }
                    }
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching invitations:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την ανάκτηση προσκλήσεων'
        });
    }
});

/**
 * Get committee status for a specific thesis
 * GET /api/committee/thesis/:thesisId/status
 * 
 * This endpoint returns the current committee composition and status for a thesis.
 * It's like checking the guest list for your party to see who's coming.
 */
router.get('/thesis/:thesisId/status', requireAuth, async (req, res) => {
    const { thesisId } = req.params;
    const userId = req.user.id;

    try {
        // First check if the user has permission to view this thesis committee info
        // Students can view their own thesis, professors can view theses they supervise or are committee members of
        const accessCheck = await pool.query(`
            SELECT DISTINCT tw.id
            FROM thesis_works tw
            WHERE tw.id = $1 AND (
                tw.student_id = $2 OR 
                tw.supervisor_id = $2 OR 
                EXISTS (
                    SELECT 1 FROM thesis_committee_members tcm 
                    WHERE tcm.thesis_id = tw.id AND tcm.professor_id = $2
                )
            )
        `, [thesisId, userId]);

        if (accessCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτές τις πληροφορίες'
            });
        }

        // Get the committee composition
        const committee = await pool.query(`
            SELECT 
                tcm.id,
                tcm.role,
                tcm.status,
                tcm.invited_at,
                tcm.responded_at,
                u.first_name,
                u.last_name,
                u.email,
                p.specialization,
                p.office_location
            FROM thesis_committee_members tcm
            JOIN users u ON tcm.professor_id = u.id
            LEFT JOIN professors p ON u.id = p.user_id
            WHERE tcm.thesis_id = $1
            ORDER BY tcm.role DESC, tcm.invited_at ASC
        `, [thesisId]);

        // Calculate committee statistics
        const stats = committee.rows.reduce((acc, member) => {
            acc.total++;
            if (member.status === 'accepted') acc.accepted++;
            if (member.status === 'pending') acc.pending++;
            if (member.status === 'rejected') acc.rejected++;
            return acc;
        }, { total: 0, accepted: 0, pending: 0, rejected: 0 });

        const isComplete = stats.pending === 0 && stats.accepted >= 2;

        res.json({
            success: true,
            data: {
                thesisId: parseInt(thesisId),
                committee: committee.rows.map(member => ({
                    id: member.id,
                    role: member.role,
                    status: member.status,
                    invitedAt: member.invited_at,
                    respondedAt: member.responded_at,
                    professor: {
                        name: `${member.first_name} ${member.last_name}`,
                        email: member.email,
                        specialization: member.specialization,
                        office: member.office_location
                    }
                })),
                statistics: stats,
                isComplete: isComplete
            }
        });

    } catch (error) {
        console.error('Error fetching committee status:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την ανάκτηση κατάστασης επιτροπής'
        });
    }
});

module.exports = router;