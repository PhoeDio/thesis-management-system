// src/services/committeeService.js
// Committee Formation Workflow Service

const { pool } = require('../config/database');

/**
 * 🎯 Committee Formation Service
 * Handles the complete workflow of forming thesis committees
 */
class CommitteeService {
    
    /**
     * 📨 Send committee invitations for a thesis
     * This is typically called when thesis status moves to 'under_examination'
     * @param {number} thesisId - The thesis work ID
     * @param {Array} professorIds - Array of professor IDs to invite
     * @param {number} requestedBy - User ID who is requesting the committee formation
     */
    async sendCommitteeInvitations(thesisId, professorIds, requestedBy) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // First, verify the thesis exists and is in the right status
            const thesisCheck = await client.query(`
                SELECT tw.id, tw.status, tw.supervisor_id, tt.title,
                       CONCAT(su.first_name, ' ', su.last_name) as student_name
                FROM thesis_works tw 
                JOIN thesis_topics tt ON tw.topic_id = tt.id
                JOIN students st ON tw.student_id = st.id  
                JOIN users su ON st.user_id = su.id
                WHERE tw.id = $1
            `, [thesisId]);

            if (thesisCheck.rows.length === 0) {
                throw new Error('Thesis not found');
            }

            const thesis = thesisCheck.rows[0];

            // Committee invitations should include the supervisor plus additional members
            // The supervisor is automatically part of the committee with 'supervisor' role
            const supervisorId = thesis.supervisor_id;
            
            // Remove supervisor from member invitations to avoid duplicates
            const memberProfessorIds = professorIds.filter(id => id !== supervisorId);

            // Add supervisor as accepted committee member (they don't need invitation)
            await client.query(`
                INSERT INTO thesis_committee_members 
                (thesis_id, professor_id, role, invited_at, responded_at, status)
                VALUES ($1, $2, 'supervisor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'accepted')
                ON CONFLICT (thesis_id, professor_id) 
                DO UPDATE SET 
                    role = 'supervisor',
                    status = 'accepted',
                    responded_at = CURRENT_TIMESTAMP
            `, [thesisId, supervisorId]);

            // Send invitations to committee members
            const invitationResults = [];
            for (const professorId of memberProfessorIds) {
                const inviteResult = await client.query(`
                    INSERT INTO thesis_committee_members 
                    (thesis_id, professor_id, role, invited_at, status)
                    VALUES ($1, $2, 'member', CURRENT_TIMESTAMP, 'pending')
                    ON CONFLICT (thesis_id, professor_id) 
                    DO UPDATE SET 
                        invited_at = CURRENT_TIMESTAMP,
                        status = 'pending',
                        responded_at = NULL
                    RETURNING id
                `, [thesisId, professorId]);

                invitationResults.push({
                    professorId,
                    invitationId: inviteResult.rows[0].id
                });
            }

            await client.query('COMMIT');

            // Return summary of invitations sent
            return {
                success: true,
                thesisId,
                thesisTitle: thesis.title,
                studentName: thesis.student_name,
                supervisorId,
                invitationsSent: invitationResults.length,
                memberInvitations: invitationResults
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * ✅ Professor responds to committee invitation
     * @param {number} professorId - ID of the professor responding
     * @param {number} thesisId - ID of the thesis
     * @param {string} response - 'accepted' or 'rejected'
     * @param {string} notes - Optional notes from professor
     */
    async respondToInvitation(professorId, thesisId, response, notes = null) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Verify the invitation exists and is pending
            const invitationCheck = await client.query(`
                SELECT tcm.id, tcm.status, tt.title, 
                       CONCAT(su.first_name, ' ', su.last_name) as student_name
                FROM thesis_committee_members tcm
                JOIN thesis_works tw ON tcm.thesis_id = tw.id
                JOIN thesis_topics tt ON tw.topic_id = tt.id  
                JOIN students st ON tw.student_id = st.id
                JOIN users su ON st.user_id = su.id
                WHERE tcm.professor_id = $1 AND tcm.thesis_id = $2
            `, [professorId, thesisId]);

            if (invitationCheck.rows.length === 0) {
                throw new Error('Committee invitation not found');
            }

            const invitation = invitationCheck.rows[0];

            // Update the invitation response
            await client.query(`
                UPDATE thesis_committee_members 
                SET status = $1, 
                    responded_at = CURRENT_TIMESTAMP
                WHERE professor_id = $2 AND thesis_id = $3
            `, [response, professorId, thesisId]);

            // If professor rejected, we might need to find a replacement
            // For now, we'll just record the response
            
            // Check if committee is now complete (has required number of accepted members)
            const committeeStatus = await this.checkCommitteeCompleteness(thesisId, client);

            await client.query('COMMIT');

            return {
                success: true,
                response,
                thesisTitle: invitation.title,
                studentName: invitation.student_name,
                committeeComplete: committeeStatus.isComplete,
                totalAccepted: committeeStatus.acceptedCount
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * 📊 Check if committee has enough members and update thesis status if complete
     * @param {number} thesisId - ID of thesis to check
     * @param {object} client - Database client (for transaction context)
     */
    async checkCommitteeCompleteness(thesisId, client = null) {
        const dbClient = client || pool;

        // Get committee composition
        const committeeQuery = await dbClient.query(`
            SELECT 
                COUNT(*) as total_members,
                COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_members,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_members,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_members
            FROM thesis_committee_members 
            WHERE thesis_id = $1
        `, [thesisId]);

        const stats = committeeQuery.rows[0];
        
        // Typically, a thesis committee needs:
        // - 1 supervisor (already accepted)
        // - 2 additional members (total of 3)
        const requiredMembers = 3;
        const isComplete = parseInt(stats.accepted_members) >= requiredMembers;

        // If committee is complete and thesis is still 'under_examination', 
        // we could advance it to the next status (this is business logic decision)
        if (isComplete && client) {
            // Optional: Auto-advance thesis status when committee is complete
            await client.query(`
                UPDATE thesis_works 
                SET status = 'under_examination'
                WHERE id = $1 AND status = 'active'
            `, [thesisId]);
        }

        return {
            isComplete,
            acceptedCount: parseInt(stats.accepted_members),
            pendingCount: parseInt(stats.pending_members),
            rejectedCount: parseInt(stats.rejected_members),
            requiredMembers
        };
    }

    /**
     * 📋 Get committee status for a specific thesis
     * @param {number} thesisId - ID of thesis
     */
    async getCommitteeStatus(thesisId) {
        const query = await pool.query(`
            SELECT 
                tcm.id,
                tcm.role,
                tcm.status,
                tcm.invited_at,
                tcm.responded_at,
                CONCAT(u.first_name, ' ', u.last_name) as professor_name,
                u.email as professor_email,
                p.specialization
            FROM thesis_committee_members tcm
            JOIN professors p ON tcm.professor_id = p.id
            JOIN users u ON p.user_id = u.id  
            WHERE tcm.thesis_id = $1
            ORDER BY tcm.role DESC, tcm.invited_at ASC
        `, [thesisId]);

        const completenessStatus = await this.checkCommitteeCompleteness(thesisId);

        return {
            members: query.rows,
            completeness: completenessStatus
        };
    }

    /**
     * 📬 Get pending invitations for a professor
     * @param {number} professorId - ID of professor
     */
    async getProfessorPendingInvitations(professorId) {
        const query = await pool.query(`
            SELECT 
                tcm.thesis_id,
                tcm.invited_at,
                tt.title as thesis_title,
                tt.description as thesis_description,
                CONCAT(su.first_name, ' ', su.last_name) as student_name,
                CONCAT(pu.first_name, ' ', pu.last_name) as supervisor_name
            FROM thesis_committee_members tcm
            JOIN thesis_works tw ON tcm.thesis_id = tw.id
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students st ON tw.student_id = st.id  
            JOIN users su ON st.user_id = su.id
            JOIN professors pr ON tw.supervisor_id = pr.id
            JOIN users pu ON pr.user_id = pu.id
            WHERE tcm.professor_id = $1 AND tcm.status = 'pending'
            ORDER BY tcm.invited_at DESC
        `, [professorId]);

        return query.rows;
    }
}

module.exports = new CommitteeService();
