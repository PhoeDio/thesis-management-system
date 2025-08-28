// src/routes/committeeRoutes.js
// Express routes for committee management functionality

const express = require('express');
const router = express.Router();
const committeeService = require('../services/committeeService');
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * 🎯 Committee Formation Routes
 * These handle the complete workflow of thesis committee formation
 */

/**
 * 📨 POST /api/committee/invite
 * Send committee invitations for a thesis
 * Only secretary or supervisor can initiate this
 */
router.post('/invite', requireAuth, async (req, res) => {
    try {
        const { thesisId, professorIds } = req.body;
        const requestedBy = req.user.id;

        // Validate required fields
        if (!thesisId || !professorIds || !Array.isArray(professorIds)) {
            return res.status(400).json({
                message: 'Missing required fields: thesisId and professorIds array'
            });
        }

        // Check if user has permission to create committees
        // Secretaries can create any committee, professors can only create for their supervised theses
        if (req.user.user_type === 'professor') {
            // Verify this professor supervises the thesis
            const supervisionCheck = await pool.query(`
                SELECT tw.id FROM thesis_works tw 
                JOIN professors p ON tw.supervisor_id = p.id
                WHERE tw.id = $1 AND p.user_id = $2
            `, [thesisId, req.user.id]);

            if (supervisionCheck.rows.length === 0) {
                return res.status(403).json({
                    message: 'You can only create committees for theses you supervise'
                });
            }
        } else if (req.user.user_type !== 'secretary') {
            return res.status(403).json({
                message: 'Only secretaries and supervisors can create thesis committees'
            });
        }

        const result = await committeeService.sendCommitteeInvitations(
            thesisId, 
            professorIds, 
            requestedBy
        );

        res.json({
            message: 'Committee invitations sent successfully',
            data: result
        });

    } catch (error) {
        console.error('❌ Committee invitation error:', error);
        res.status(500).json({
            message: 'Failed to send committee invitations',
            error: error.message
        });
    }
});

/**
 * ✅ POST /api/committee/respond
 * Professor responds to committee invitation
 */
router.post('/respond', requireAuth, requireRole(['professor']), async (req, res) => {
    try {
        const { thesisId, response, notes } = req.body;
        const professorId = req.user.id;

        // Validate input
        if (!thesisId || !response || !['accepted', 'rejected'].includes(response)) {
            return res.status(400).json({
                message: 'Missing or invalid fields. Response must be "accepted" or "rejected"'
            });
        }

        // Get professor ID from user ID (we need the professors table ID, not users table)
        const professorQuery = await pool.query(`
            SELECT id FROM professors WHERE user_id = $1
        `, [professorId]);

        if (professorQuery.rows.length === 0) {
            return res.status(403).json({
                message: 'Professor profile not found'
            });
        }

        const professorDbId = professorQuery.rows[0].id;

        const result = await committeeService.respondToInvitation(
            professorDbId,
            thesisId, 
            response,
            notes
        );

        res.json({
            message: `Committee invitation ${response} successfully`,
            data: result
        });

    } catch (error) {
        console.error('❌ Committee response error:', error);
        res.status(500).json({
            message: 'Failed to respond to committee invitation',
            error: error.message
        });
    }
});

/**
 * 📋 GET /api/committee/status/:thesisId
 * Get committee status for a specific thesis
 */
router.get('/status/:thesisId', requireAuth, async (req, res) => {
    try {
        const { thesisId } = req.params;

        // Basic permission check - users can see committee status for theses they're involved with
        const accessCheck = await pool.query(`
            SELECT DISTINCT tw.id
            FROM thesis_works tw
            LEFT JOIN students s ON tw.student_id = s.id
            LEFT JOIN professors p1 ON tw.supervisor_id = p1.id
            LEFT JOIN thesis_committee_members tcm ON tw.id = tcm.thesis_id
            LEFT JOIN professors p2 ON tcm.professor_id = p2.id
            WHERE tw.id = $1 AND (
                s.user_id = $2 OR          -- Student owns this thesis
                p1.user_id = $2 OR         -- User supervises this thesis  
                p2.user_id = $2 OR         -- User is committee member
                $3 = 'secretary'           -- User is secretary (can see all)
            )
        `, [thesisId, req.user.id, req.user.user_type]);

        if (accessCheck.rows.length === 0) {
            return res.status(403).json({
                message: 'Access denied to this thesis committee information'
            });
        }

        const status = await committeeService.getCommitteeStatus(thesisId);

        res.json({
            message: 'Committee status retrieved successfully',
            data: status
        });

    } catch (error) {
        console.error('❌ Committee status error:', error);
        res.status(500).json({
            message: 'Failed to get committee status',
            error: error.message
        });
    }
});

/**
 * 📬 GET /api/committee/my-invitations
 * Get pending committee invitations for the current professor
 */
router.get('/my-invitations', requireAuth, requireRole(['professor']), async (req, res) => {
    try {
        // Get professor ID from user ID
        const professorQuery = await pool.query(`
            SELECT id FROM professors WHERE user_id = $1
        `, [req.user.id]);

        if (professorQuery.rows.length === 0) {
            return res.status(403).json({
                message: 'Professor profile not found'
            });
        }

        const professorDbId = professorQuery.rows[0].id;
        const invitations = await committeeService.getProfessorPendingInvitations(professorDbId);

        res.json({
            message: 'Pending invitations retrieved successfully',
            data: {
                count: invitations.length,
                invitations
            }
        });

    } catch (error) {
        console.error('❌ Get invitations error:', error);
        res.status(500).json({
            message: 'Failed to get committee invitations',
            error: error.message
        });
    }
});

/**
 * 📊 GET /api/committee/statistics
 * Get overall committee formation statistics (for secretaries)
 */
router.get('/statistics', requireAuth, requireRole(['secretary']), async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(DISTINCT tcm.thesis_id) as theses_with_committees,
                COUNT(CASE WHEN tcm.status = 'pending' THEN 1 END) as pending_invitations,
                COUNT(CASE WHEN tcm.status = 'accepted' THEN 1 END) as accepted_invitations,
                COUNT(CASE WHEN tcm.status = 'rejected' THEN 1 END) as rejected_invitations,
                AVG(CASE WHEN tcm.responded_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (tcm.responded_at - tcm.invited_at))/86400 
                    END) as avg_response_time_days
            FROM thesis_committee_members tcm
        `);

        // Get committee completeness overview
        const completenessStats = await pool.query(`
            WITH committee_counts AS (
                SELECT 
                    thesis_id,
                    COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_count
                FROM thesis_committee_members
                GROUP BY thesis_id
            )
            SELECT 
                COUNT(CASE WHEN accepted_count >= 3 THEN 1 END) as complete_committees,
                COUNT(CASE WHEN accepted_count < 3 THEN 1 END) as incomplete_committees,
                COUNT(*) as total_committees
            FROM committee_counts
        `);

        res.json({
            message: 'Committee statistics retrieved successfully',
            data: {
                invitationStats: stats.rows[0],
                completenessStats: completenessStats.rows[0]
            }
        });

    } catch (error) {
        console.error('❌ Committee statistics error:', error);
        res.status(500).json({
            message: 'Failed to get committee statistics',
            error: error.message
        });
    }
});

// Import pool for database queries (should be at top, but added here for clarity)
const { pool } = require('../config/database');

module.exports = router;
