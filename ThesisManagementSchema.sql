-- ========================================
-- ΣΥΣΤΗΜΑ ΔΙΑΧΕΙΡΙΣΗΣ ΔΙΠΛΩΜΑΤΙΚΩΝ ΕΡΓΑΣΙΩΝ
-- PostgreSQL Database Schema
-- ========================================

-- Δημιουργία Database
-- CREATE DATABASE thesis_management;

-- Τύποι χρηστών
CREATE TYPE user_type AS ENUM ('professor', 'student', 'secretary');

-- Καταστάσεις διπλωματικών
CREATE TYPE thesis_status AS ENUM ('under_assignment', 'active', 'under_examination', 'completed', 'cancelled');

-- Ρόλοι σε τριμελείς επιτροπές
CREATE TYPE committee_role AS ENUM ('supervisor', 'member');

-- Κατάσταση πρόσκλησης
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'rejected');

-- Τρόπος εξέτασης
CREATE TYPE examination_type AS ENUM ('in_person', 'online');

-- ========================================
-- ΠΙΝΑΚΑΣ ΧΡΗΣΤΩΝ
-- ========================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    user_type user_type NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΦΟΙΤΗΤΩΝ (Επιπλέον πληροφορίες)
-- ========================================
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    student_id VARCHAR(20) UNIQUE NOT NULL, -- Αριθμός Μητρώου
    phone_mobile VARCHAR(20),
    phone_landline VARCHAR(20),
    address TEXT,
    contact_email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΔΙΔΑΣΚΟΝΤΩΝ (Επιπλέον πληροφορίες)
-- ========================================
CREATE TABLE professors (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    office_location VARCHAR(100),
    phone VARCHAR(20),
    specialization TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΘΕΜΑΤΩΝ ΔΙΠΛΩΜΑΤΙΚΩΝ
-- ========================================
CREATE TABLE thesis_topics (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    detailed_description_file VARCHAR(255), -- PDF path
    supervisor_id INTEGER REFERENCES professors(id) ON DELETE CASCADE,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΔΙΠΛΩΜΑΤΙΚΩΝ ΕΡΓΑΣΙΩΝ
-- ========================================
CREATE TABLE thesis_works (
    id SERIAL PRIMARY KEY,
    topic_id INTEGER REFERENCES thesis_topics(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    supervisor_id INTEGER REFERENCES professors(id) ON DELETE CASCADE,
    status thesis_status DEFAULT 'under_assignment',
    
    -- Ημερομηνίες σταδίων
    assigned_at TIMESTAMP,
    activated_at TIMESTAMP,
    examination_started_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- Στοιχεία Γενικής Συνέλευσης
    general_assembly_number VARCHAR(20),
    general_assembly_year INTEGER,
    
    -- Λόγος ακύρωσης
    cancellation_reason TEXT,
    cancelled_by user_type,
    
    -- Τελικός βαθμός
    final_grade DECIMAL(4,2),
    
    -- Σύνδεσμος στο αποθετήριο
    repository_link VARCHAR(500),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΜΕΛΩΝ ΤΡΙΜΕΛΟΥΣ ΕΠΙΤΡΟΠΗΣ
-- ========================================
CREATE TABLE thesis_committee_members (
    id SERIAL PRIMARY KEY,
    thesis_id INTEGER REFERENCES thesis_works(id) ON DELETE CASCADE,
    professor_id INTEGER REFERENCES professors(id) ON DELETE CASCADE,
    role committee_role NOT NULL,
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    status invitation_status DEFAULT 'pending',
    
    UNIQUE(thesis_id, professor_id)
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΣΗΜΕΙΩΣΕΩΝ ΔΙΔΑΣΚΟΝΤΩΝ
-- ========================================
CREATE TABLE thesis_notes (
    id SERIAL PRIMARY KEY,
    thesis_id INTEGER REFERENCES thesis_works(id) ON DELETE CASCADE,
    professor_id INTEGER REFERENCES professors(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL CHECK (length(note_text) <= 300),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΑΡΧΕΙΩΝ ΔΙΠΛΩΜΑΤΙΚΩΝ
-- ========================================
CREATE TABLE thesis_files (
    id SERIAL PRIMARY KEY,
    thesis_id INTEGER REFERENCES thesis_works(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50), -- 'draft', 'final', 'supplementary'
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΕΞΩΤΕΡΙΚΩΝ ΣΥΝΔΕΣΜΩΝ
-- ========================================
CREATE TABLE thesis_external_links (
    id SERIAL PRIMARY KEY,
    thesis_id INTEGER REFERENCES thesis_works(id) ON DELETE CASCADE,
    link_url VARCHAR(500) NOT NULL,
    link_description VARCHAR(200),
    added_by INTEGER REFERENCES users(id),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΠΑΡΟΥΣΙΑΣΕΩΝ
-- ========================================
CREATE TABLE thesis_presentations (
    id SERIAL PRIMARY KEY,
    thesis_id INTEGER REFERENCES thesis_works(id) ON DELETE CASCADE,
    presentation_date TIMESTAMP NOT NULL,
    examination_type examination_type NOT NULL,
    
    -- Για δια ζώσης εξέταση
    room_location VARCHAR(100),
    
    -- Για online εξέταση
    meeting_link VARCHAR(500),
    
    -- Ανακοίνωση
    announcement_text TEXT,
    announcement_generated_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΒΑΘΜΟΛΟΓΙΩΝ
-- ========================================
CREATE TABLE thesis_grades (
    id SERIAL PRIMARY KEY,
    thesis_id INTEGER REFERENCES thesis_works(id) ON DELETE CASCADE,
    professor_id INTEGER REFERENCES professors(id) ON DELETE CASCADE,
    
    -- Βαθμολογία ανά κριτήριο (σύμφωνα με κανονισμό)
    implementation_grade DECIMAL(4,2), -- Υλοποίηση
    presentation_grade DECIMAL(4,2),   -- Παρουσίαση
    innovation_grade DECIMAL(4,2),     -- Καινοτομία
    bibliography_grade DECIMAL(4,2),   -- Βιβλιογραφία
    writing_grade DECIMAL(4,2),        -- Συγγραφή
    
    -- Συνολικός βαθμός από τον καθηγητή
    total_grade DECIMAL(4,2) NOT NULL,
    
    -- Σχόλια
    comments TEXT,
    
    graded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(thesis_id, professor_id)
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΙΣΤΟΡΙΚΟΥ ΚΑΤΑΣΤΑΣΕΩΝ
-- ========================================
CREATE TABLE thesis_status_history (
    id SERIAL PRIMARY KEY,
    thesis_id INTEGER REFERENCES thesis_works(id) ON DELETE CASCADE,
    from_status thesis_status,
    to_status thesis_status NOT NULL,
    changed_by INTEGER REFERENCES users(id),
    change_reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ΠΙΝΑΚΑΣ ΔΗΜΟΣΙΩΝ ΑΝΑΚΟΙΝΩΣΕΩΝ
-- ========================================
CREATE TABLE public_announcements (
    id SERIAL PRIMARY KEY,
    thesis_id INTEGER REFERENCES thesis_works(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    presentation_date TIMESTAMP,
    location VARCHAR(200),
    meeting_link VARCHAR(500),
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- ========================================
-- INDEXES ΓΙΑ ΒΕΛΤΙΩΣΗ ΑΠΟΔΟΣΗΣ
-- ========================================

-- Indexes για συχνές αναζητήσεις
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_type ON users(user_type);

CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_user_id ON students(user_id);

CREATE INDEX idx_professors_user_id ON professors(user_id);

CREATE INDEX idx_thesis_topics_supervisor ON thesis_topics(supervisor_id);
CREATE INDEX idx_thesis_topics_available ON thesis_topics(is_available);

CREATE INDEX idx_thesis_works_status ON thesis_works(status);
CREATE INDEX idx_thesis_works_student ON thesis_works(student_id);
CREATE INDEX idx_thesis_works_supervisor ON thesis_works(supervisor_id);
CREATE INDEX idx_thesis_works_dates ON thesis_works(assigned_at, activated_at, completed_at);

CREATE INDEX idx_committee_members_thesis ON thesis_committee_members(thesis_id);
CREATE INDEX idx_committee_members_professor ON thesis_committee_members(professor_id);
CREATE INDEX idx_committee_members_status ON thesis_committee_members(status);

CREATE INDEX idx_thesis_notes_thesis ON thesis_notes(thesis_id);
CREATE INDEX idx_thesis_notes_professor ON thesis_notes(professor_id);

CREATE INDEX idx_thesis_grades_thesis ON thesis_grades(thesis_id);
CREATE INDEX idx_thesis_grades_professor ON thesis_grades(professor_id);

CREATE INDEX idx_status_history_thesis ON thesis_status_history(thesis_id);
CREATE INDEX idx_status_history_date ON thesis_status_history(changed_at);

CREATE INDEX idx_announcements_date ON public_announcements(published_at);
CREATE INDEX idx_announcements_active ON public_announcements(is_active);

-- ========================================
-- TRIGGERS ΓΙΑ ΑΥΤΟΜΑΤΗ ΕΝΗΜΕΡΩΣΗ
-- ========================================

-- Trigger για ενημέρωση updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Εφαρμογή του trigger σε πίνακες
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_professors_updated_at BEFORE UPDATE ON professors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_thesis_topics_updated_at BEFORE UPDATE ON thesis_topics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_thesis_works_updated_at BEFORE UPDATE ON thesis_works
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- ΔΕΔΟΜΕΝΑ ΠΑΡΑΔΕΙΓΜΑΤΟΣ
-- ========================================

-- Εισαγωγή δεδομένων δοκιμής
INSERT INTO users (username, password_hash, email, first_name, last_name, user_type) VALUES
('prof_smith', '$2b$12$hash1', 'smith@university.edu', 'John', 'Smith', 'professor'),
('prof_jones', '$2b$12$hash2', 'jones@university.edu', 'Mary', 'Jones', 'professor'),
('prof_brown', '$2b$12$hash3', 'brown@university.edu', 'Robert', 'Brown', 'professor'),
('student001', '$2b$12$hash4', 'student1@student.edu', 'Alice', 'Wilson', 'student'),
('student002', '$2b$12$hash5', 'student2@student.edu', 'Bob', 'Johnson', 'student'),
('secretary', '$2b$12$hash6', 'secretary@university.edu', 'Admin', 'Secretary', 'secretary');

-- Εισαγωγή καθηγητών
INSERT INTO professors (user_id, office_location, phone, specialization) VALUES
(1, 'Room 101', '210-1234567', 'Machine Learning'),
(2, 'Room 102', '210-1234568', 'Database Systems'),
(3, 'Room 103', '210-1234569', 'Software Engineering');

-- Εισαγωγή φοιτητών
INSERT INTO students (user_id, student_id, phone_mobile, address, contact_email) VALUES
(4, 'AM001', '6901234567', 'Athens, Greece', 'alice.wilson@student.edu'),
(5, 'AM002', '6901234568', 'Thessaloniki, Greece', 'bob.johnson@student.edu');

-- Εισαγωγή θεμάτων
INSERT INTO thesis_topics (title, description, supervisor_id) VALUES
('AI-based Recommendation System', 'Development of a recommendation system using machine learning algorithms', 1),
('Database Optimization Techniques', 'Research on advanced database optimization methods', 2),
('Web Application Security', 'Analysis of modern web application security vulnerabilities', 3);

-- ========================================
-- VIEWS ΓΙΑ ΣΥΧΝΕΣ ΑΝΑΖΗΤΗΣΕΙΣ
-- ========================================

-- View για πλήρεις πληροφορίες χρηστών
CREATE VIEW user_profiles AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.user_type,
    CASE 
        WHEN u.user_type = 'student' THEN s.student_id
        ELSE NULL
    END as student_id,
    CASE 
        WHEN u.user_type = 'professor' THEN p.specialization
        ELSE NULL
    END as specialization,
    u.created_at,
    u.is_active
FROM users u
LEFT JOIN students s ON u.id = s.user_id
LEFT JOIN professors p ON u.id = p.user_id;

-- View για ενεργές διπλωματικές με πλήρεις πληροφορίες
CREATE VIEW active_thesis_overview AS
SELECT 
    tw.id,
    tt.title as topic_title,
    tt.description as topic_description,
    concat(su.first_name, ' ', su.last_name) as student_name,
    st.student_id,
    concat(pu.first_name, ' ', pu.last_name) as supervisor_name,
    tw.status,
    tw.assigned_at,
    tw.activated_at,
    tw.general_assembly_number,
    tw.general_assembly_year
FROM thesis_works tw
JOIN thesis_topics tt ON tw.topic_id = tt.id
JOIN students st ON tw.student_id = st.id
JOIN users su ON st.user_id = su.id
JOIN professors pr ON tw.supervisor_id = pr.id
JOIN users pu ON pr.user_id = pu.id
WHERE tw.status IN ('under_assignment', 'active', 'under_examination');

-- View για τριμελείς επιτροπές
CREATE VIEW thesis_committees AS
SELECT 
    tw.id as thesis_id,
    tt.title as thesis_title,
    concat(su.first_name, ' ', su.last_name) as student_name,
    tcm.role,
    concat(pu.first_name, ' ', pu.last_name) as professor_name,
    tcm.status as invitation_status,
    tcm.invited_at,
    tcm.responded_at
FROM thesis_works tw
JOIN thesis_topics tt ON tw.topic_id = tt.id
JOIN students st ON tw.student_id = st.id
JOIN users su ON st.user_id = su.id
JOIN thesis_committee_members tcm ON tw.id = tcm.thesis_id
JOIN professors pr ON tcm.professor_id = pr.id
JOIN users pu ON pr.user_id = pu.id
ORDER BY tw.id, tcm.role;

-- ========================================
-- ΤΕΛΟΣ ΣΧΕΔΙΑΣΗΣ ΒΑΣΗΣ ΔΕΔΟΜΕΝΩΝ
-- ========================================
