// src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Create our directory structure helper
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        // Directory doesn't exist, create it
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// Function to generate the correct file path based on thesis
async function generateFilePath(thesisId, fileType = 'documents') {
    // Get current year for organization
    const currentYear = new Date().getFullYear();
    
    // Build the directory path
    const baseDir = path.join(process.cwd(), 'uploads', 'thesis-files', currentYear.toString(), `thesis-${thesisId}`, fileType);
    
    // Ensure the directory exists
    await ensureDirectoryExists(baseDir);
    
    return baseDir;
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            // Extract thesis_id from request (could be from params, body, or query)
            const thesisId = req.params.thesisId || req.body.thesisId || req.query.thesisId;
            
            if (!thesisId) {
                return cb(new Error('Thesis ID is required for file upload'), null);
            }
            
            // Determine file type based on user role or explicit parameter
            let fileType = 'documents'; // default
            if (req.body.fileType === 'evaluation' || req.user?.user_type === 'professor') {
                fileType = 'evaluations';
            }
            
            const uploadPath = await generateFilePath(thesisId, fileType);
            cb(null, uploadPath);
        } catch (error) {
            cb(error, null);
        }
    },
    filename: function (req, file, cb) {
        // Generate unique filename while preserving extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8'); // Handle Greek filenames
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext).substring(0, 100); // Limit length
        
        // Create safe filename
        const safeFileName = `${baseName}-${uniqueSuffix}${ext}`;
        cb(null, safeFileName);
    }
});

// File filter function for security
const fileFilter = function (req, file, cb) {
    // Define allowed MIME types for academic documents
    const allowedMimeTypes = [
        'application/pdf',                    // PDF documents
        'application/msword',                 // .doc files
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.ms-powerpoint',      // .ppt files
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
        'application/vnd.ms-excel',           // .xls files
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/zip',                    // ZIP archives
        'application/x-zip-compressed',       // ZIP archives (alternative MIME)
        'text/plain',                         // Text files
        'image/jpeg',                         // Images
        'image/png',
        'image/gif',
        'image/webp'
    ];
    
    // Check file extension as additional security layer
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', 
                              '.zip', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
        cb(null, true);
    } else {
        cb(new Error(`File type not allowed. Supported types: ${allowedExtensions.join(', ')}`), false);
    }
};

// Create multer upload instance
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024, // 10GB in bytes
        files: 5 // Maximum 5 files per request
    },
    fileFilter: fileFilter
});

// Middleware to handle upload errors gracefully
const handleUploadError = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: 'File too large. Maximum size allowed is 10GB.',
                error: 'FILE_TOO_LARGE'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(413).json({
                success: false,
                message: 'Too many files. Maximum 5 files allowed per upload.',
                error: 'TOO_MANY_FILES'
            });
        }
    }
    
    if (error.message.includes('File type not allowed')) {
        return res.status(415).json({
            success: false,
            message: error.message,
            error: 'UNSUPPORTED_FILE_TYPE'
        });
    }
    
    if (error.message.includes('Thesis ID is required')) {
        return res.status(400).json({
            success: false,
            message: 'Thesis ID is required for file upload',
            error: 'MISSING_THESIS_ID'
        });
    }
    
    // For any other errors
    return res.status(500).json({
        success: false,
        message: 'Upload failed due to server error',
        error: 'UPLOAD_ERROR'
    });
};

module.exports = {
    upload,
    handleUploadError,
    ensureDirectoryExists,
    generateFilePath
};