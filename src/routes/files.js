// src/routes/files.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const { upload, handleUploadError } = require('../middleware/upload');
const { pool } = require('../config/database');

// Authentication middleware - require user to be logged in
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
            error: 'UNAUTHORIZED'
        });
    }
    next();
};

// Authorization middleware - check if user can access specific thesis
const checkThesisAccess = async (req, res, next) => {
    try {
        const thesisId = req.params.thesisId;
        const userId = req.session.user.id;
        const userType = req.session.user.user_type;
        
        // Secretaries can access all thesis files for administrative purposes
        if (userType === 'secretary') {
            return next();
        }
        
        // Check if user has access to this thesis through database relationships
        const accessQuery = `
            SELECT DISTINCT tw.id, tw.student_id, tw.supervisor_id 
            FROM thesis_works tw
            LEFT JOIN students s ON tw.student_id = s.id
            LEFT JOIN professors p ON tw.supervisor_id = p.id
            LEFT JOIN thesis_committee_members tcm ON tw.id = tcm.thesis_id
            LEFT JOIN professors cp ON tcm.professor_id = cp.id
            WHERE tw.id = $1 AND (
                s.user_id = $2 OR          -- Student owns this thesis
                p.user_id = $2 OR          -- User is thesis supervisor
                cp.user_id = $2            -- User is committee member
            )
        `;
        
        const result = await pool.query(accessQuery, [thesisId, userId]);
        
        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access files for this thesis',
                error: 'FORBIDDEN'
            });
        }
        
        next();
    } catch (error) {
        console.error('Authorization check failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify permissions',
            error: 'AUTH_CHECK_FAILED'
        });
    }
};

// Route to upload files to a specific thesis
router.post('/thesis/:thesisId/upload', 
    requireAuth, 
    checkThesisAccess,
    upload.array('files', 5), // Allow up to 5 files with field name 'files'
    handleUploadError,
    async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No files were uploaded',
                    error: 'NO_FILES'
                });
            }

            const thesisId = req.params.thesisId;
            const uploadedBy = req.session.user.id;
            const uploadResults = [];

            // Process each uploaded file
            for (const file of req.files) {
                // Save file information to database
                const insertQuery = `
                    INSERT INTO thesis_files (thesis_id, file_name, file_path, file_type, uploaded_by)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id, file_name, uploaded_at
                `;
                
                const values = [
                    thesisId,
                    file.originalname, // Store original filename
                    file.path,         // Store full server path
                    file.mimetype,     // Store MIME type
                    uploadedBy
                ];

                const result = await pool.query(insertQuery, values);
                
                uploadResults.push({
                    id: result.rows[0].id,
                    fileName: result.rows[0].file_name,
                    uploadedAt: result.rows[0].uploaded_at,
                    fileSize: file.size,
                    fileType: file.mimetype
                });
            }

            res.status(201).json({
                success: true,
                message: `Successfully uploaded ${req.files.length} file(s)`,
                files: uploadResults,
                thesisId: thesisId
            });

        } catch (error) {
            console.error('File upload error:', error);
            
            // Clean up uploaded files if database insertion fails
            if (req.files) {
                for (const file of req.files) {
                    try {
                        await fs.unlink(file.path);
                    } catch (unlinkError) {
                        console.error('Failed to clean up file:', file.path, unlinkError);
                    }
                }
            }

            res.status(500).json({
                success: false,
                message: 'Failed to save file information to database',
                error: 'DATABASE_ERROR'
            });
        }
    }
);

// Route to list all files for a specific thesis
router.get('/thesis/:thesisId/files', requireAuth, checkThesisAccess, async (req, res) => {
    try {
        const thesisId = req.params.thesisId;
        
        const filesQuery = `
            SELECT tf.id, tf.file_name, tf.file_type, tf.uploaded_at,
                   u.first_name, u.last_name, u.user_type as uploader_type
            FROM thesis_files tf
            JOIN users u ON tf.uploaded_by = u.id
            WHERE tf.thesis_id = $1
            ORDER BY tf.uploaded_at DESC
        `;
        
        const result = await pool.query(filesQuery, [thesisId]);
        
        res.json({
            success: true,
            thesisId: thesisId,
            files: result.rows.map(row => ({
                id: row.id,
                fileName: row.file_name,
                fileType: row.file_type,
                uploadedAt: row.uploaded_at,
                uploadedBy: {
                    name: `${row.first_name} ${row.last_name}`,
                    type: row.uploader_type
                }
            }))
        });
        
    } catch (error) {
        console.error('Failed to fetch files:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve files',
            error: 'FETCH_FAILED'
        });
    }
});

// Route to download a specific file
router.get('/thesis/:thesisId/files/:fileId/download', requireAuth, checkThesisAccess, async (req, res) => {
    try {
        const { thesisId, fileId } = req.params;
        
        // Get file information from database
        const fileQuery = `
            SELECT tf.file_name, tf.file_path, tf.file_type
            FROM thesis_files tf
            WHERE tf.id = $1 AND tf.thesis_id = $2
        `;
        
        const result = await pool.query(fileQuery, [fileId, thesisId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
                error: 'FILE_NOT_FOUND'
            });
        }
        
        const file = result.rows[0];
        const filePath = file.file_path;
        
        // Check if file exists on disk
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server',
                error: 'FILE_MISSING'
            });
        }
        
        // Set appropriate headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.file_name)}"`);
        res.setHeader('Content-Type', file.file_type);
        
        // Stream the file to the client
        const fileStream = require('fs').createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('File download error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download file',
            error: 'DOWNLOAD_FAILED'
        });
    }
});

// Route to delete a file (only by uploader or admin)
router.delete('/thesis/:thesisId/files/:fileId', requireAuth, checkThesisAccess, async (req, res) => {
    try {
        const { thesisId, fileId } = req.params;
        const userId = req.session.user.id;
        const userType = req.session.user.user_type;
        
        // Get file information and check ownership
        const fileQuery = `
            SELECT tf.file_path, tf.file_name, tf.uploaded_by
            FROM thesis_files tf
            WHERE tf.id = $1 AND tf.thesis_id = $2
        `;
        
        const result = await pool.query(fileQuery, [fileId, thesisId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
                error: 'FILE_NOT_FOUND'
            });
        }
        
        const file = result.rows[0];
        
        // Check if user can delete this file (owner or secretary)
        if (file.uploaded_by !== userId && userType !== 'secretary') {
            return res.status(403).json({
                success: false,
                message: 'You can only delete files you uploaded',
                error: 'DELETE_FORBIDDEN'
            });
        }
        
        // Delete from database first
        await pool.query('DELETE FROM thesis_files WHERE id = $1', [fileId]);
        
        // Try to delete physical file
        try {
            await fs.unlink(file.file_path);
        } catch (unlinkError) {
            console.warn('Failed to delete physical file:', file.file_path, unlinkError);
            // Don't fail the request if file deletion fails - database record is removed
        }
        
        res.json({
            success: true,
            message: `File "${file.file_name}" deleted successfully`
        });
        
    } catch (error) {
        console.error('File deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file',
            error: 'DELETE_FAILED'
        });
    }
});

module.exports = router;