const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
require('dotenv').config();
const { testConnection } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Helper function για safe require
function safeRequire(modulePath, fallbackMessage) {
    try {
        return require(modulePath);
    } catch (error) {
        console.warn(`⚠️  ${fallbackMessage}: ${error.message}`);
        // Return a dummy router που δίνει 501 Not Implemented
        const dummyRouter = express.Router();
        dummyRouter.use('*', (req, res) => {
            res.status(501).json({ 
                message: `${fallbackMessage} - Route not implemented yet`,
                path: req.originalUrl,
                method: req.method
            });
        });
        return dummyRouter;
    }
}

// Routes με safe loading
const authRoutes = require('./src/routes/auth'); // Αυτό υπάρχει ήδη
const professorRoutes = safeRequire('./src/routes/professor', 'Professor routes not found');
const studentRoutes = safeRequire('./src/routes/student', 'Student routes not found');
const secretaryRoutes = safeRequire('./src/routes/secretary', 'Secretary routes not found');
const publicRoutes = safeRequire('./src/routes/public', 'Public routes not found');

app.use('/api/auth', authRoutes);
app.use('/api/professor', professorRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/secretary', secretaryRoutes);
app.use('/api/public', publicRoutes);

// Serve main page
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    
    // Έλεγχος αν υπάρχει το index.html
    const fs = require('fs');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // Temporary landing page
        res.send(`
            <!DOCTYPE html>
            <html lang="el">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Thesis Management System</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        max-width: 800px; 
                        margin: 0 auto; 
                        padding: 20px; 
                        background-color: #f5f5f5;
                    }
                    .container {
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    h1 { color: #2c3e50; text-align: center; }
                    .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
                    .success { background-color: #d4edda; color: #155724; }
                    .warning { background-color: #fff3cd; color: #856404; }
                    .info { background-color: #d1ecf1; color: #0c5460; }
                    ul { list-style-type: none; padding: 0; }
                    li { padding: 8px; margin: 5px 0; background: #f8f9fa; border-radius: 3px; }
                    a { color: #007bff; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎓 Thesis Management System</h1>
                    
                    <div class="status success">
                        ✅ Server is running successfully on port ${PORT}
                    </div>
                    
                    <div class="status info">
                        📊 System Status:
                        <ul>
                            <li>✅ Express.js Server</li>
                            <li>✅ PostgreSQL Database</li>
                            <li>✅ Authentication Routes</li>
                            <li>⚠️  Frontend UI (In Development)</li>
                        </ul>
                    </div>
                    
                    <h2>🔗 Available Endpoints:</h2>
                    <ul>
                        <li><strong>Authentication:</strong> <a href="/api/auth/status">/api/auth/status</a></li>
                        <li><strong>Public API:</strong> <a href="/api/public/health">/api/public/health</a></li>
                        <li><strong>Test Page:</strong> <a href="/test-auth.html">/test-auth.html</a></li>
                    </ul>
                    
                    <h2>🧪 Development Tools:</h2>
                    <ul>
                        <li><a href="/test-auth.html">Authentication Test Interface</a></li>
                        <li><a href="/api/public/announcements">Public Announcements API</a></li>
                        <li><a href="/api/public/statistics">Public Statistics</a></li>
                    </ul>
                    
                    <div class="status warning">
                        🚧 This is a development version. Some features are still being implemented.
                    </div>
                    
                    <footer style="text-align: center; margin-top: 30px; color: #666;">
                        <p>Thesis Management System v1.0.0 - University of Patras CEID</p>
                    </footer>
                </div>
            </body>
            </html>
        `);
    }
});

// API Status endpoint
app.get('/api/status', async (req, res) => {
    try {
        const dbConnected = await testConnection();
        res.json({
            status: 'running',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            database: dbConnected ? 'connected' : 'disconnected',
            routes: {
                auth: 'active',
                professor: 'limited',
                student: 'limited', 
                secretary: 'limited',
                public: 'limited'
            },
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 Server Error:', err.stack);
    res.status(500).json({ 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        message: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        available_routes: [
            '/api/auth/*',
            '/api/professor/*',
            '/api/student/*',
            '/api/secretary/*',
            '/api/public/*',
            '/test-auth.html'
        ],
        timestamp: new Date().toISOString()
    });
});

// Test database connection on startup
testConnection().then(connected => {
    if (connected) {
        console.log('✅ Database connection verified');
    } else {
        console.log('❌ Database connection failed - server will run but functionality will be limited');
    }
});

app.listen(PORT, () => {
    console.log('\n🚀 Thesis Management System Server Started');
    console.log('='.repeat(50));
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 API Status: http://localhost:${PORT}/api/status`);
    console.log(`🧪 Test Auth: http://localhost:${PORT}/test-auth.html`);
    console.log('='.repeat(50));
    console.log('💡 Ready for development!\n');
});

module.exports = app;
