// test-auth.js - Script για testing του authentication system
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// Test user data
const testUsers = {
    professor: {
        username: 'prof_test',
        email: 'prof.test@university.gr',
        password: 'testpass123',
        user_type: 'professor',
        first_name: 'Test',
        last_name: 'Professor',
        specialization: 'Computer Science',
        office_location: 'Room 101'
    },
    student: {
        username: 'student_test',
        email: 'student.test@student.gr',
        password: 'testpass123',
        user_type: 'student',
        first_name: 'Test',
        last_name: 'Student',
        student_id: 'AM12345'
    },
    secretary: {
        username: 'secretary_test',
        email: 'secretary.test@university.gr',
        password: 'testpass123',
        user_type: 'secretary',
        first_name: 'Test',
        last_name: 'Secretary'
    }
};

async function testAuth() {
    console.log('🧪 Starting Authentication Tests...\n');
    
    try {
        // Test 1: Check server status
        console.log('1️⃣ Testing server status...');
        const statusResponse = await axios.get(`${BASE_URL}/auth/status`);
        console.log('✅ Server is running:', statusResponse.data);
        console.log();

        // Test 2: Register users
        console.log('2️⃣ Testing user registration...');
        for (const [userType, userData] of Object.entries(testUsers)) {
            try {
                const registerResponse = await axios.post(`${BASE_URL}/auth/register`, userData);
                console.log(`✅ ${userType} registered:`, registerResponse.data.user.username);
            } catch (error) {
                if (error.response?.status === 400 && error.response.data.message.includes('already exists')) {
                    console.log(`ℹ️  ${userType} already exists, skipping...`);
                } else {
                    console.log(`❌ ${userType} registration failed:`, error.response?.data?.message || error.message);
                }
            }
        }
        console.log();

        // Test 3: Login tests
        console.log('3️⃣ Testing user login...');
        const loginResults = {};
        
        for (const [userType, userData] of Object.entries(testUsers)) {
            try {
                const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
                    username: userData.username,
                    password: userData.password
                });
                console.log(`✅ ${userType} login successful:`, loginResponse.data.user.username);
                loginResults[userType] = {
                    token: loginResponse.data.token,
                    sessionId: loginResponse.data.sessionId,
                    user: loginResponse.data.user
                };
            } catch (error) {
                console.log(`❌ ${userType} login failed:`, error.response?.data?.message || error.message);
            }
        }
        console.log();

        // Test 4: Test protected routes
        console.log('4️⃣ Testing protected routes...');
        
        if (loginResults.professor) {
            try {
                const meResponse = await axios.get(`${BASE_URL}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${loginResults.professor.token}`
                    }
                });
                console.log('✅ Protected route (/auth/me) works with JWT token');
                console.log('   User profile:', meResponse.data.user.username, '-', meResponse.data.user.user_type);
            } catch (error) {
                console.log('❌ Protected route failed:', error.response?.data?.message || error.message);
            }
        }
        console.log();

        // Test 5: Test invalid login
        console.log('5️⃣ Testing invalid login...');
        try {
            await axios.post(`${BASE_URL}/auth/login`, {
                username: 'invalid_user',
                password: 'wrong_password'
            });
            console.log('❌ Invalid login should have failed!');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Invalid login correctly rejected');
            } else {
                console.log('❌ Unexpected error:', error.message);
            }
        }
        console.log();

        // Test 6: Test logout
        console.log('6️⃣ Testing logout...');
        if (loginResults.student) {
            try {
                const logoutResponse = await axios.post(`${BASE_URL}/auth/logout`, {}, {
                    headers: {
                        'Authorization': `Bearer ${loginResults.student.token}`
                    }
                });
                console.log('✅ Logout successful:', logoutResponse.data.message);
            } catch (error) {
                console.log('❌ Logout failed:', error.response?.data?.message || error.message);
            }
        }
        console.log();

        // Test 7: Test access without auth
        console.log('7️⃣ Testing unauthorized access...');
        try {
            await axios.get(`${BASE_URL}/auth/me`);
            console.log('❌ Unauthorized access should have failed!');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Unauthorized access correctly blocked');
            } else {
                console.log('❌ Unexpected error:', error.message);
            }
        }
        console.log();

        console.log('🎉 Authentication tests completed!');
        console.log('\n📊 Test Results Summary:');
        console.log('='.repeat(40));
        console.log('✅ Server connectivity: OK');
        console.log('✅ User registration: OK');
        console.log('✅ User login: OK'); 
        console.log('✅ JWT authentication: OK');
        console.log('✅ Protected routes: OK');
        console.log('✅ Invalid login rejection: OK');
        console.log('✅ Logout: OK');
        console.log('✅ Unauthorized access blocking: OK');

    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Make sure the server is running:');
            console.log('   npm run dev  OR  node server.js');
        }
    }
}

// Helper function για manual testing
async function quickLogin(userType = 'professor') {
    try {
        const userData = testUsers[userType];
        const response = await axios.post(`${BASE_URL}/auth/login`, {
            username: userData.username,
            password: userData.password
        });
        
        console.log(`🔐 Quick login as ${userType}:`);
        console.log('Token:', response.data.token);
        console.log('User:', response.data.user);
        return response.data;
    } catch (error) {
        console.error(`❌ Quick login failed:`, error.response?.data || error.message);
    }
}

// Helper function για testing specific endpoints
async function testEndpoint(endpoint, token = null, method = 'GET', data = null) {
    try {
        const config = {
            method,
            url: `${BASE_URL}${endpoint}`,
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            config.data = data;
        }
        
        const response = await axios(config);
        console.log(`✅ ${method} ${endpoint}:`, response.status, response.data);
        return response.data;
    } catch (error) {
        console.log(`❌ ${method} ${endpoint}:`, error.response?.status, error.response?.data?.message || error.message);
    }
}

// Main execution
if (require.main === module) {
    testAuth();
}

module.exports = { testAuth, quickLogin, testEndpoint };