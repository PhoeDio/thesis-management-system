// src/routes/status.js
// This file manages thesis status transitions and workflow rules

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');

/*
 * STATUS TRANSITION RULES AND VALIDATION
 * 
 * This system implements the complex business rules that govern how a thesis
 * moves through its lifecycle. Think of it like traffic lights at a busy
 * intersection - they ensure that traffic flows smoothly and safely by
 * preventing dangerous or impossible movements.
 * 
 * The academic process has similar rules: certain transitions are only allowed
 * under specific conditions, and different user types have different permissions
 * to trigger those transitions.
 */

// Define the valid status transitions and their rules
const STATUS_TRANSITIONS = {
    'under_assignment': {
        // From "under assignment" status, these transitions are possible:
        'active': {
            allowedRoles: ['professor', 'secretary'],
            conditions: ['committee_complete'],
            description: 'Ενεργοποίηση διπλωματικής με πλήρη επιτροπή'
        },
        'cancelled': {
            allowedRoles: ['professor', 'secretary'],
            conditions: [],
            description: 'Ακύρωση διπλωματικής εργασίας'
        }
    },
    'active': {
        // From "active" status, these transitions are possible:
        'under_examination': {
            allowedRoles: ['professor'],
            conditions: ['final_document_uploaded', 'supervisor_approval'],
            description: 'Έναρξη εξεταστικής διαδικασίας'
        },
        'cancelled': {
            allowedRoles: ['professor', 'secretary'],
            conditions: [],
            description: 'Ακύρωση ενεργής διπλωματικής'
        }
    },
    'under_examination': {
        // From "under examination" status, these transitions are possible:
        'completed': {
            allowedRoles: ['professor', 'secretary'],
            conditions: ['presentation_completed', 'grades_submitted'],
            description: 'Ολοκλήρωση διπλωματικής εργασίας'
        },
        'active': {
            allowedRoles: ['professor'],
            conditions: [],
            description: 'Επιστροφή σε ενεργή κατάσταση'
        },
        'cancelled': {
            allowedRoles: ['professor', 'secretary'],
            conditions: [],
            description: 'Ακύρωση κατά την εξέταση'
        }
    },
    'completed': {
        // Completed theses generally don't transition to other statuses
        // But we might allow corrections or appeals in special circumstances
    },
    'cancelled': {
        // Cancelled theses might be reactivated under special circumstances
        'under_assignment': {
            allowedRoles: ['secretary'],
            conditions: [],
            description: 'Επαναφορά ακυρωμένης διπλωματικής'
        }
    }
};

/*
 * CONDITION VALIDATORS
 * 
 * These functions check whether specific conditions are met before allowing
 * a status transition. Think of them like security guards who verify that
 * everyone has the proper credentials before entering a restricted area.
 */

const conditionValidators = {
    // Check if the thesis committee is complete and all members have accepted
    committee_complete: async (client, thesisId) => {
        const result = await client.query(`
            SELECT 
                COUNT(*) as total_members,
                COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_members,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_members
            FROM thesis_committee_members 
            WHERE thesis_id = $1
        `, [thesisId]);
        
        const stats = result.rows[0];
        return stats.pending_members == 0 && stats.accepted_members >= 2;
    },

    // Check if the final thesis document has been uploaded
    final_document_uploaded: async (client, thesisId) => {
        const result = await client.query(`
            SELECT COUNT(*) as file_count
            FROM thesis_files 
            WHERE thesis_id = $1 AND file_type = 'application/pdf'
        `, [thesisId]);
        
        return result.rows[0].file_count > 0;
    },

    // Check if the supervisor has given approval for examination
    supervisor_approval: async (client, thesisId, supervisorId) => {
        // In a real system, this might check for a specific approval record
        // For now, we'll assume supervisor approval is implicit if they request the transition
        return true;
    },

    // Check if the thesis presentation has been completed
    presentation_completed: async (client, thesisId) => {
        const result = await client.query(`
            SELECT COUNT(*) as presentation_count
            FROM thesis_presentations 
            WHERE thesis_id = $1 AND presentation_date <= CURRENT_DATE
        `, [thesisId]);
        
        return result.rows[0].presentation_count > 0;
    },

    // Check if all committee members have submitted their grades
    grades_submitted: async (client, thesisId) => {
        const committeeCount = await client.query(`
            SELECT COUNT(*) as member_count
            FROM thesis_committee_members 
            WHERE thesis_id = $1 AND status = 'accepted'
        `, [thesisId]);

        const gradesCount = await client.query(`
            SELECT COUNT(*) as grade_count
            FROM thesis_grades 
            WHERE thesis_id = $1
        `, [thesisId]);
        
        return committeeCount.rows[0].member_count === gradesCount.rows[0].grade_count;
    }
};

/**
 * Get valid transitions for a thesis
 * GET /api/status/thesis/:thesisId/transitions
 * 
 * This endpoint returns all valid status transitions available for a specific thesis
 * based on the current user's role and the thesis's current conditions.
 * It's like showing someone all the doors they're allowed to open from their current room.
 */
router.get('/thesis/:thesisId/transitions', requireAuth, async (req, res) => {
    const { thesisId } = req.params;
    const userId = req.user.id;
    const userType = req.user.user_type;

    const client = await pool.connect();
    
    try {
        // First, verify the user has access to this thesis
        const accessCheck = await client.query(`
            SELECT tw.id, tw.status, tw.supervisor_id, tw.student_id
            FROM thesis_works tw
            WHERE tw.id = $1 AND (
                tw.student_id = $2 OR 
                tw.supervisor_id = $2 OR 
                $3 = 'secretary' OR
                EXISTS (
                    SELECT 1 FROM thesis_committee_members tcm 
                    WHERE tcm.thesis_id = tw.id AND tcm.professor_id = $2 AND tcm.status = 'accepted'
                )
            )
        `, [thesisId, userId, userType]);

        if (accessCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη διπλωματική εργασία'
            });
        }

        const thesis = accessCheck.rows[0];
        const currentStatus = thesis.status;
        const availableTransitions = STATUS_TRANSITIONS[currentStatus] || {};

        // Filter transitions based on user role and check conditions
        const validTransitions = [];

        for (const [targetStatus, transitionRule] of Object.entries(availableTransitions)) {
            // Check if user role is allowed for this transition
            if (!transitionRule.allowedRoles.includes(userType)) {
                continue;
            }

            // Check all conditions for this transition
            let conditionsMet = true;
            const conditionResults = {};

            for (const condition of transitionRule.conditions) {
                if (conditionValidators[condition]) {
                    const result = await conditionValidators[condition](client, thesisId, userId);
                    conditionResults[condition] = result;
                    if (!result) {
                        conditionsMet = false;
                    }
                }
            }

            validTransitions.push({
                targetStatus,
                description: transitionRule.description,
                conditionsMet,
                conditions: conditionResults,
                requiredConditions: transitionRule.conditions
            });
        }

        res.json({
            success: true,
            data: {
                thesisId: parseInt(thesisId),
                currentStatus,
                availableTransitions: validTransitions,
                userRole: userType
            }
        });

    } catch (error) {
        console.error('Error fetching transitions:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την ανάκτηση διαθέσιμων μεταβάσεων'
        });
    } finally {
        client.release();
    }
});

/**
 * Execute a status transition
 * POST /api/status/thesis/:thesisId/transition
 * 
 * This endpoint executes a status transition for a thesis after validating
 * all permissions and conditions. It's like going through a security checkpoint -
 * everything must be verified before the transition is allowed.
 * 
 * Body expected:
 * {
 *   targetStatus: "under_examination",
 *   reason: "Student has submitted final document and is ready for defense"
 * }
 */
router.post('/thesis/:thesisId/transition', requireAuth, async (req, res) => {
    const { thesisId } = req.params;
    const { targetStatus, reason } = req.body;
    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!targetStatus) {
        return res.status(400).json({
            success: false,
            message: 'Η νέα κατάσταση είναι υποχρεωτική'
        });
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Get current thesis information and verify access
        const thesisCheck = await client.query(`
            SELECT tw.id, tw.status, tw.supervisor_id, tw.student_id, tt.title
            FROM thesis_works tw
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            WHERE tw.id = $1 AND (
                tw.student_id = $2 OR 
                tw.supervisor_id = $2 OR 
                $3 = 'secretary' OR
                EXISTS (
                    SELECT 1 FROM thesis_committee_members tcm 
                    WHERE tcm.thesis_id = tw.id AND tcm.professor_id = $2 AND tcm.status = 'accepted'
                )
            )
        `, [thesisId, userId, userType]);

        if (thesisCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                message: 'Δεν έχετε δικαίωμα να αλλάξετε την κατάσταση αυτής της διπλωματικής'
            });
        }

        const thesis = thesisCheck.rows[0];
        const currentStatus = thesis.status;

        // Check if this transition is valid
        const availableTransitions = STATUS_TRANSITIONS[currentStatus] || {};
        const transitionRule = availableTransitions[targetStatus];

        if (!transitionRule) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Η μετάβαση από "${currentStatus}" σε "${targetStatus}" δεν είναι έγκυρη`
            });
        }

        // Check user role permission
        if (!transitionRule.allowedRoles.includes(userType)) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                message: 'Δεν έχετε δικαίωμα να εκτελέσετε αυτή τη μετάβαση κατάστασης'
            });
        }

        // Validate all required conditions
        const failedConditions = [];
        for (const condition of transitionRule.conditions) {
            if (conditionValidators[condition]) {
                const result = await conditionValidators[condition](client, thesisId, userId);
                if (!result) {
                    failedConditions.push(condition);
                }
            }
        }

        if (failedConditions.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Δεν πληρούνται όλες οι προϋποθέσεις για αυτή τη μετάβαση',
                failedConditions
            });
        }

        // Execute the status transition
        const updateResult = await client.query(`
            UPDATE thesis_works 
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `, [targetStatus, thesisId]);

        // Record the status change in history
        await client.query(`
            INSERT INTO thesis_status_history 
            (thesis_id, from_status, to_status, changed_by, change_reason, changed_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [thesisId, currentStatus, targetStatus, userId, reason || transitionRule.description]);

        // Execute any post-transition actions based on the new status
        await executePostTransitionActions(client, thesisId, targetStatus, userId);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: `Η κατάσταση της διπλωματικής άλλαξε επιτυχώς σε "${targetStatus}"`,
            data: {
                thesisId: parseInt(thesisId),
                fromStatus: currentStatus,
                toStatus: targetStatus,
                changedBy: userId,
                changedAt: new Date().toISOString(),
                reason: reason || transitionRule.description
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Status transition error:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την αλλαγή κατάστασης'
        });
    } finally {
        client.release();
    }
});

/**
 * Get status history for a thesis
 * GET /api/status/thesis/:thesisId/history
 * 
 * This endpoint returns the complete status change history for a thesis.
 * It's like reading the logbook of a ship's journey - every important
 * event is recorded with timestamps and responsible parties.
 */
router.get('/thesis/:thesisId/history', requireAuth, async (req, res) => {
    const { thesisId } = req.params;
    const userId = req.user.id;
    const userType = req.user.user_type;

    try {
        // Verify access to this thesis
        const accessCheck = await pool.query(`
            SELECT tw.id
            FROM thesis_works tw
            WHERE tw.id = $1 AND (
                tw.student_id = $2 OR 
                tw.supervisor_id = $2 OR 
                $3 = 'secretary' OR
                EXISTS (
                    SELECT 1 FROM thesis_committee_members tcm 
                    WHERE tcm.thesis_id = tw.id AND tcm.professor_id = $2
                )
            )
        `, [thesisId, userId, userType]);

        if (accessCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Δεν έχετε δικαίωμα πρόσβασης στο ιστορικό αυτής της διπλωματικής'
            });
        }

        // Get the complete status history
        const history = await pool.query(`
            SELECT 
                tsh.*,
                u.first_name,
                u.last_name,
                u.user_type
            FROM thesis_status_history tsh
            JOIN users u ON tsh.changed_by = u.id
            WHERE tsh.thesis_id = $1
            ORDER BY tsh.changed_at DESC
        `, [thesisId]);

        res.json({
            success: true,
            data: {
                thesisId: parseInt(thesisId),
                history: history.rows.map(record => ({
                    id: record.id,
                    fromStatus: record.from_status,
                    toStatus: record.to_status,
                    reason: record.change_reason,
                    changedAt: record.changed_at,
                    changedBy: {
                        id: record.changed_by,
                        name: `${record.first_name} ${record.last_name}`,
                        type: record.user_type
                    }
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching status history:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την ανάκτηση ιστορικού καταστάσεων'
        });
    }
});

/**
 * Post-transition actions
 * 
 * This function executes additional actions that should happen automatically
 * when a thesis transitions to certain statuses. Think of it like dominoes -
 * when one piece falls (status changes), it can trigger other pieces to fall
 * (additional automated actions).
 */
async function executePostTransitionActions(client, thesisId, newStatus, userId) {
    switch (newStatus) {
        case 'active':
            // When a thesis becomes active, we might want to notify the student
            // and create initial progress tracking records
            console.log(`Thesis ${thesisId} activated - triggering post-activation actions`);
            break;

        case 'under_examination':
            // When a thesis enters examination, we might want to:
            // - Notify all committee members
            // - Create a presentation scheduling record
            // - Set up grade submission forms
            console.log(`Thesis ${thesisId} under examination - triggering examination setup`);
            break;

        case 'completed':
            // When a thesis is completed, we might want to:
            // - Archive the thesis files
            // - Generate completion certificates
            // - Update student graduation status
            console.log(`Thesis ${thesisId} completed - triggering completion actions`);
            break;

        case 'cancelled':
            // When a thesis is cancelled, we might want to:
            // - Archive the thesis files
            // - Notify all involved parties
            // - Free up the topic for reassignment
            console.log(`Thesis ${thesisId} cancelled - triggering cleanup actions`);
            break;
    }
}

/**
 * Get status workflow overview
 * GET /api/status/workflow-info
 * 
 * This endpoint returns information about the status workflow system,
 * including all possible statuses and transitions. It's like providing
 * a map of all possible paths through the thesis process.
 */
router.get('/workflow-info', requireAuth, async (req, res) => {
    try {
        const workflowInfo = {
            statuses: {
                'under_assignment': 'Υπό Ανάθεση',
                'active': 'Ενεργή',
                'under_examination': 'Υπό Εξέταση',
                'completed': 'Ολοκληρωμένη',
                'cancelled': 'Ακυρωμένη'
            },
            transitions: STATUS_TRANSITIONS,
            userPermissions: {
                student: 'Μπορεί να προβάλει την κατάσταση της διπλωματικής του',
                professor: 'Μπορεί να αλλάζει καταστάσεις σύμφωνα με τους κανόνες',
                secretary: 'Έχει εκτεταμένα δικαιώματα αλλαγής καταστάσεων'
            }
        };

        res.json({
            success: true,
            data: workflowInfo
        });

    } catch (error) {
        console.error('Error fetching workflow info:', error);
        res.status(500).json({
            success: false,
            message: 'Σφάλμα κατά την ανάκτηση πληροφοριών workflow'
        });
    }
});

module.exports = router;