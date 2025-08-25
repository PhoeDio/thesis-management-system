// src/routes/public.js - Public routes (δεν χρειάζονται authentication)
const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

/**
 * 📢 GET /api/public/announcements - Δημόσιες ανακοινώσεις παρουσιάσεων
 * Query params: 
 * - format: 'json' | 'xml' (default: json)
 * - from: start date (YYYY-MM-DD)
 * - to: end date (YYYY-MM-DD)
 */
router.get('/announcements', async (req, res) => {
    try {
        const { format = 'json', from, to } = req.query;

        let query = `
            SELECT 
                pa.id,
                pa.title,
                pa.content,
                pa.presentation_date,
                pa.location,
                pa.meeting_link,
                pa.published_at,
                tt.title as thesis_title,
                tt.description as thesis_description,
                CONCAT(student_user.first_name, ' ', student_user.last_name) as student_name,
                s.student_id as student_number,
                CONCAT(supervisor_user.first_name, ' ', supervisor_user.last_name) as supervisor_name
            FROM public_announcements pa
            JOIN thesis_works tw ON pa.thesis_id = tw.id
            JOIN thesis_topics tt ON tw.topic_id = tt.id
            JOIN students st ON tw.student_id = st.id
            JOIN users student_user ON st.user_id = student_user.id
            JOIN students s ON st.id = s.id
            JOIN professors p ON tw.supervisor_id = p.id
            JOIN users supervisor_user ON p.user_id = supervisor_user.id
            WHERE pa.is_active = true
        `;

        const params = [];
        let paramCount = 0;

        // Date filtering
        if (from) {
            paramCount++;
            query += ` AND pa.presentation_date >= $${paramCount}`;
            params.push(from);
        }

        if (to) {
            paramCount++;
            query += ` AND pa.presentation_date <= $${paramCount}`;
            params.push(to);
        }

        query += ` ORDER BY pa.presentation_date ASC`;

        const result = await pool.query(query, params);
        const announcements = result.rows;

        // Return data based on format
        if (format.toLowerCase() === 'xml') {
            res.set('Content-Type', 'application/xml');
            const xml = generateXMLFeed(announcements);
            res.send(xml);
        } else {
            res.json({
                announcements,
                count: announcements.length,
                generated_at: new Date().toISOString(),
                filters: { from, to }
            });
        }

    } catch (error) {
        console.error('Get public announcements error:', error);
        res.status(500).json({ message: 'Failed to load announcements' });
    }
});

/**
 * 📊 GET /api/public/statistics - Δημόσια στατιστικά (anonymized)
 */
router.get('/statistics', async (req, res) => {
    try {
        // Γενικά στατιστικά (χωρίς προσωπικά δεδομένα)
        const generalStats = await pool.query(`
            SELECT 
                COUNT(CASE WHEN tw.status = 'completed' THEN 1 END) as total_completed,
                COUNT(CASE WHEN tw.status = 'active' THEN 1 END) as active_theses,
                COUNT(CASE WHEN tw.status = 'under_examination' THEN 1 END) as under_examination,
                AVG(CASE WHEN tw.status = 'completed' AND tw.final_grade IS NOT NULL 
                    THEN tw.final_grade END) as avg_grade,
                AVG(CASE WHEN tw.status = 'completed' AND tw.completed_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (tw.completed_at - tw.activated_at))/86400 
                    END) as avg_completion_days
            FROM thesis_works tw
        `);

        // Στατιστικά ανά έτος
        const yearlyStats = await pool.query(`
            SELECT 
                EXTRACT(YEAR FROM completed_at) as year,
                COUNT(*) as completed_count,
                AVG(final_grade) as avg_grade
            FROM thesis_works
            WHERE status = 'completed' AND completed_at IS NOT NULL
            GROUP BY EXTRACT(YEAR FROM completed_at)
            ORDER BY year DESC
            LIMIT 5
        `);

        // Κατανομή βαθμών (anonymized)
        const gradeDistribution = await pool.query(`
            SELECT 
                CASE 
                    WHEN final_grade >= 8.5 THEN 'Excellent (8.5-10)'
                    WHEN final_grade >= 6.5 THEN 'Very Good (6.5-8.4)'
                    WHEN final_grade >= 5.0 THEN 'Good (5.0-6.4)'
                    ELSE 'Other'
                END as grade_category,
                COUNT(*) as count
            FROM thesis_works
            WHERE status = 'completed' AND final_grade IS NOT NULL
            GROUP BY 
                CASE 
                    WHEN final_grade >= 8.5 THEN 'Excellent (8.5-10)'
                    WHEN final_grade >= 6.5 THEN 'Very Good (6.5-8.4)'
                    WHEN final_grade >= 5.0 THEN 'Good (5.0-6.4)'
                    ELSE 'Other'
                END
            ORDER BY 
                CASE 
                    WHEN final_grade >= 8.5 THEN 1
                    WHEN final_grade >= 6.5 THEN 2
                    WHEN final_grade >= 5.0 THEN 3
                    ELSE 4
                END
        `);

        res.json({
            general: generalStats.rows[0],
            yearly: yearlyStats.rows,
            grade_distribution: gradeDistribution.rows,
            generated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Get public statistics error:', error);
        res.status(500).json({ message: 'Failed to load statistics' });
    }
});

/**
 * 🔍 GET /api/public/search - Αναζήτηση σε δημόσια διαθέσιμα δεδομένα
 */
router.get('/search', async (req, res) => {
    try {
        const { q, type = 'all' } = req.query;

        if (!q || q.length < 3) {
            return res.status(400).json({ message: 'Search query must be at least 3 characters' });
        }

        const results = {
            completed_theses: [],
            professors: [],
            announcements: []
        };

        // Αναζήτηση σε ολοκληρωμένες διπλωματικές (μόνο τίτλος, όχι προσωπικά δεδομένα)
        if (type === 'all' || type === 'theses') {
            const thesesResult = await pool.query(`
                SELECT 
                    tt.title,
                    tt.description,
                    tw.completed_at,
                    tw.final_grade
                FROM thesis_works tw
                JOIN thesis_topics tt ON tw.topic_id = tt.id
                WHERE tw.status = 'completed' 
                    AND (tt.title ILIKE $1 OR tt.description ILIKE $1)
                ORDER BY tw.completed_at DESC
                LIMIT 20
            `, [`%${q}%`]);

            results.completed_theses = thesesResult.rows;
        }

        // Αναζήτηση καθηγητών (δημόσια διαθέσιμες πληροφορίες)
        if (type === 'all' || type === 'professors') {
            const professorsResult = await pool.query(`
                SELECT 
                    CONCAT(u.first_name, ' ', u.last_name) as name,
                    p.specialization,
                    p.office_location
                FROM professors p
                JOIN users u ON p.user_id = u.id
                WHERE u.is_active = true 
                    AND (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR p.specialization ILIKE $1)
                ORDER BY u.last_name, u.first_name
                LIMIT 10
            `, [`%${q}%`]);

            results.professors = professorsResult.rows;
        }

        // Αναζήτηση ανακοινώσεων
        if (type === 'all' || type === 'announcements') {
            const announcementsResult = await pool.query(`
                SELECT 
                    pa.title,
                    pa.content,
                    pa.presentation_date,
                    pa.location
                FROM public_announcements pa
                WHERE pa.is_active = true 
                    AND (pa.title ILIKE $1 OR pa.content ILIKE $1)
                ORDER BY pa.presentation_date DESC
                LIMIT 10
            `, [`%${q}%`]);

            results.announcements = announcementsResult.rows;
        }

        res.json({
            query: q,
            type,
            results,
            total_results: results.completed_theses.length + 
                           results.professors.length + 
                           results.announcements.length
        });

    } catch (error) {
        console.error('Public search error:', error);
        res.status(500).json({ message: 'Search failed' });
    }
});

/**
 * 📋 GET /api/public/health - Health check endpoint
 */
router.get('/health', async (req, res) => {
    try {
        // Test database connection
        const dbTest = await pool.query('SELECT NOW() as timestamp');
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                timestamp: dbTest.rows[0].timestamp
            },
            version: '1.0.0'
        });

    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: {
                connected: false,
                error: error.message
            }
        });
    }
});

/**
 * Helper function για δημιουργία XML feed
 */
function generateXMLFeed(announcements) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<announcements>\n';
    xml += `  <generated_at>${new Date().toISOString()}</generated_at>\n`;
    xml += `  <count>${announcements.length}</count>\n`;
    
    announcements.forEach(announcement => {
        xml += '  <announcement>\n';
        xml += `    <id>${announcement.id}</id>\n`;
        xml += `    <title><![CDATA[${announcement.title}]]></title>\n`;
        xml += `    <content><![CDATA[${announcement.content}]]></content>\n`;
        xml += `    <presentation_date>${announcement.presentation_date}</presentation_date>\n`;
        xml += `    <location><![CDATA[${announcement.location || ''}]]></location>\n`;
        if (announcement.meeting_link) {
            xml += `    <meeting_link>${announcement.meeting_link}</meeting_link>\n`;
        }
        xml += `    <thesis>\n`;
        xml += `      <title><![CDATA[${announcement.thesis_title}]]></title>\n`;
        xml += `      <student_name><![CDATA[${announcement.student_name}]]></student_name>\n`;
        xml += `      <student_number>${announcement.student_number}</student_number>\n`;
        xml += `      <supervisor_name><![CDATA[${announcement.supervisor_name}]]></supervisor_name>\n`;
        xml += `    </thesis>\n`;
        xml += '  </announcement>\n';
    });
    
    xml += '</announcements>';
    return xml;
}

module.exports = router;