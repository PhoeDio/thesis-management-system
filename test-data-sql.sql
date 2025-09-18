-- Initial Test Data for Thesis Management System
-- Run this after your main schema is created

-- Insert test users (password for all: 'demo2025')
-- Password hash for 'demo2025': $2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua

-- Professors
INSERT INTO users (username, email, password_hash, user_type, first_name, last_name, is_active)
VALUES 
('prof.papadopoulos', 'papadopoulos@university.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'professor', 'Γιώργος', 'Παπαδόπουλος', true),
('prof.nikolaou', 'nikolaou@university.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'professor', 'Μαρία', 'Νικολάου', true),
('prof.dimitriou', 'dimitriou@university.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'professor', 'Δημήτρης', 'Δημητρίου', true),
('prof.georgiou', 'georgiou@university.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'professor', 'Ελένη', 'Γεωργίου', true),
('prof.konstantinou', 'konstantinou@university.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'professor', 'Κώστας', 'Κωνσταντίνου', true);

-- Students
INSERT INTO users (username, email, password_hash, user_type, first_name, last_name, is_active)
VALUES 
('student.alexiou', 'alexiou@student.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'student', 'Αλέξης', 'Αλεξίου', true),
('student.maria', 'maria@student.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'student', 'Μαρία', 'Παναγιώτου', true),
('student.nikos', 'nikos@student.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'student', 'Νίκος', 'Αντωνίου', true),
('student.elena', 'elena@student.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'student', 'Έλενα', 'Σταύρου', true),
('student.dimitris', 'dimitris@student.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'student', 'Δημήτρης', 'Ιωάννου', true);

-- Secretary
INSERT INTO users (username, email, password_hash, user_type, first_name, last_name, is_active)
VALUES 
('secretary.admin', 'secretary@university.gr', '$2a$10$X4kv7j5ZcG39WgogSl16OehPwORFOJqGmROunpDPrWqDbqMsPnsua', 'secretary', 'Γραμματεία', 'ΤΜΗΥΠ', true);

-- Insert professor profiles
INSERT INTO professors (user_id, office_location, phone, specialization)
SELECT id, 
    'Κτίριο Α, Γραφείο ' || (100 + (ROW_NUMBER() OVER (ORDER BY id))),
    '2610 99' || (7000 + (ROW_NUMBER() OVER (ORDER BY id))),
    CASE 
        WHEN username = 'prof.papadopoulos' THEN 'Τεχνητή Νοημοσύνη & Μηχανική Μάθηση'
        WHEN username = 'prof.nikolaou' THEN 'Βάσεις Δεδομένων & Πληροφοριακά Συστήματα'
        WHEN username = 'prof.dimitriou' THEN 'Δίκτυα & Κατανεμημένα Συστήματα'
        WHEN username = 'prof.georgiou' THEN 'Αλγόριθμοι & Πολυπλοκότητα'
        WHEN username = 'prof.konstantinou' THEN 'Ασφάλεια Υπολογιστών'
    END
FROM users WHERE user_type = 'professor';

-- Insert student profiles
INSERT INTO students (user_id, student_id, phone_mobile, contact_email)
SELECT id,
    'ΑΜ' || (1000 + (ROW_NUMBER() OVER (ORDER BY id))),
    '697' || (1000000 + (ROW_NUMBER() OVER (ORDER BY id))),
    email
FROM users WHERE user_type = 'student';

-- Create thesis topics
INSERT INTO thesis_topics (title, description, supervisor_id, is_available, created_at)
VALUES
(
    'Ανάπτυξη Συστήματος Αναγνώρισης Συναισθημάτων με Deep Learning',
    'Η εργασία αυτή στοχεύει στην ανάπτυξη ενός συστήματος που θα μπορεί να αναγνωρίζει ανθρώπινα συναισθήματα από εικόνες προσώπων χρησιμοποιώντας τεχνικές βαθιάς μάθησης. Θα γίνει χρήση συνελικτικών νευρωνικών δικτύων (CNN) και θα εξεταστούν διάφορες αρχιτεκτονικές.',
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.papadopoulos')),
    true,
    NOW() - INTERVAL '30 days'
),
(
    'Βελτιστοποίηση Απόδοσης NoSQL Βάσεων Δεδομένων',
    'Μελέτη και υλοποίηση τεχνικών βελτιστοποίησης για NoSQL βάσεις δεδομένων. Θα αναλυθούν διάφορα μοντέλα δεδομένων και θα προταθούν βελτιώσεις για συγκεκριμένα σενάρια χρήσης.',
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.nikolaou')),
    true,
    NOW() - INTERVAL '25 days'
),
(
    'Ασφαλές Blockchain για IoT Συσκευές',
    'Σχεδιασμός και υλοποίηση ενός ελαφρού blockchain πρωτοκόλλου κατάλληλου για IoT συσκευές με περιορισμένους πόρους. Έμφαση θα δοθεί στην ασφάλεια και την ενεργειακή απόδοση.',
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.konstantinou')),
    false, -- Already assigned
    NOW() - INTERVAL '60 days'
),
(
    'Αλγόριθμοι Δρομολόγησης σε Software-Defined Networks',
    'Ανάπτυξη και αξιολόγηση νέων αλγορίθμων δρομολόγησης για SDN περιβάλλοντα. Θα υλοποιηθούν προσομοιώσεις και θα γίνει σύγκριση με υπάρχουσες λύσεις.',
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.dimitriou')),
    true,
    NOW() - INTERVAL '15 days'
),
(
    'Παράλληλοι Αλγόριθμοι για Γράφους Μεγάλης Κλίμακας',
    'Μελέτη και υλοποίηση παράλληλων αλγορίθμων για επεξεργασία γράφων με εκατομμύρια κόμβους. Θα χρησιμοποιηθούν τεχνολογίες όπως CUDA και OpenMP.',
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.georgiou')),
    false, -- Already assigned
    NOW() - INTERVAL '90 days'
);

-- Create some active thesis works (assignments)
INSERT INTO thesis_works (topic_id, student_id, supervisor_id, status, assigned_at, activated_at)
VALUES
(
    (SELECT id FROM thesis_topics WHERE title LIKE '%Blockchain%'),
    (SELECT id FROM students WHERE student_id = 'ΑΜ1001'),
    (SELECT supervisor_id FROM thesis_topics WHERE title LIKE '%Blockchain%'),
    'active',
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '40 days'
),
(
    (SELECT id FROM thesis_topics WHERE title LIKE '%Παράλληλοι Αλγόριθμοι%'),
    (SELECT id FROM students WHERE student_id = 'ΑΜ1002'),
    (SELECT supervisor_id FROM thesis_topics WHERE title LIKE '%Παράλληλοι Αλγόριθμοι%'),
    'under_examination',
    NOW() - INTERVAL '80 days',
    NOW() - INTERVAL '75 days'
);

-- Add committee members for active theses
INSERT INTO thesis_committee_members (thesis_id, professor_id, role, status, invited_at, responded_at)
VALUES
-- For Blockchain thesis
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Blockchain%'),
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.konstantinou')),
    'supervisor',
    'accepted',
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
),
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Blockchain%'),
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.dimitriou')),
    'member',
    'accepted',
    NOW() - INTERVAL '40 days',
    NOW() - INTERVAL '38 days'
),
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Blockchain%'),
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.papadopoulos')),
    'member',
    'accepted',
    NOW() - INTERVAL '40 days',
    NOW() - INTERVAL '37 days'
),
-- For Parallel Algorithms thesis (under examination)
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Παράλληλοι%'),
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.georgiou')),
    'supervisor',
    'accepted',
    NOW() - INTERVAL '80 days',
    NOW() - INTERVAL '80 days'
),
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Παράλληλοι%'),
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.dimitriou')),
    'member',
    'accepted',
    NOW() - INTERVAL '75 days',
    NOW() - INTERVAL '74 days'
),
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Παράλληλοι%'),
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.nikolaou')),
    'member',
    'accepted',
    NOW() - INTERVAL '75 days',
    NOW() - INTERVAL '73 days'
);

-- Set examination details for thesis under examination
UPDATE thesis_works 
SET 
    examination_date = NOW() + INTERVAL '7 days',
    examination_type = 'in_person',
    examination_location = 'Αίθουσα Β3',
    examination_scheduled_at = NOW() - INTERVAL '3 days',
    examination_started_at = NOW() - INTERVAL '5 days'
WHERE id = (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Παράλληλοι%');

-- Add a public announcement for the examination
INSERT INTO public_announcements (thesis_id, title, content, presentation_date, location, is_active)
VALUES
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Παράλληλοι%'),
    'Παρουσίαση Διπλωματικής: Παράλληλοι Αλγόριθμοι για Γράφους Μεγάλης Κλίμακας',
    'Η φοιτήτρια Μαρία Παναγιώτου θα παρουσιάσει τη διπλωματική της εργασία με θέμα "Παράλληλοι Αλγόριθμοι για Γράφους Μεγάλης Κλίμακας" υπό την επίβλεψη της καθ. Ελένης Γεωργίου.',
    NOW() + INTERVAL '7 days',
    'Αίθουσα Β3, Κτίριο Β, ΤΜΗΥΠ',
    true
);

-- Add some professor notes for active theses
INSERT INTO thesis_notes (thesis_id, professor_id, note_text, created_at)
VALUES
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Blockchain%'),
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.konstantinou')),
    'Εξαιρετική πρόοδος στην υλοποίηση του πρωτοκόλλου. Ο φοιτητής έχει ολοκληρώσει το 60% της εργασίας.',
    NOW() - INTERVAL '10 days'
),
(
    (SELECT tw.id FROM thesis_works tw JOIN thesis_topics tt ON tw.topic_id = tt.id WHERE tt.title LIKE '%Blockchain%'),
    (SELECT id FROM professors WHERE user_id = (SELECT id FROM users WHERE username = 'prof.konstantinou')),
    'Συνάντηση προόδου: Συζητήθηκαν θέματα βελτιστοποίησης του consensus αλγορίθμου.',
    NOW() - INTERVAL '5 days'
);

-- Display summary of created data
SELECT 
    'Test Data Created Successfully!' as message,
    (SELECT COUNT(*) FROM users WHERE user_type = 'professor') as professors,
    (SELECT COUNT(*) FROM users WHERE user_type = 'student') as students,
    (SELECT COUNT(*) FROM thesis_topics) as topics,
    (SELECT COUNT(*) FROM thesis_works) as active_theses,
    (SELECT COUNT(*) FROM public_announcements) as announcements;

-- Login Credentials Summary
SELECT '=== LOGIN CREDENTIALS ===' as info
UNION ALL
SELECT 'All passwords: demo2025'
UNION ALL
SELECT ''
UNION ALL
SELECT 'Professors:'
UNION ALL
SELECT '  - prof.papadopoulos / demo2025'
UNION ALL
SELECT '  - prof.nikolaou / demo2025'
UNION ALL
SELECT '  - prof.dimitriou / demo2025'
UNION ALL
SELECT ''
UNION ALL
SELECT 'Students:'
UNION ALL
SELECT '  - student.alexiou / demo2025 (has active thesis)'
UNION ALL
SELECT '  - student.maria / demo2025 (has thesis under examination)'
UNION ALL
SELECT '  - student.nikos / demo2025'
UNION ALL
SELECT ''
UNION ALL
SELECT 'Secretary:'
UNION ALL
SELECT '  - secretary.admin / demo2025';