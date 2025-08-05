--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-08-05 15:46:02

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 881 (class 1247 OID 16410)
-- Name: committee_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.committee_role AS ENUM (
    'supervisor',
    'member'
);


ALTER TYPE public.committee_role OWNER TO postgres;

--
-- TOC entry 887 (class 1247 OID 16424)
-- Name: examination_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.examination_type AS ENUM (
    'in_person',
    'online'
);


ALTER TYPE public.examination_type OWNER TO postgres;

--
-- TOC entry 884 (class 1247 OID 16416)
-- Name: invitation_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.invitation_status AS ENUM (
    'pending',
    'accepted',
    'rejected'
);


ALTER TYPE public.invitation_status OWNER TO postgres;

--
-- TOC entry 878 (class 1247 OID 16398)
-- Name: thesis_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.thesis_status AS ENUM (
    'under_assignment',
    'active',
    'under_examination',
    'completed',
    'cancelled'
);


ALTER TYPE public.thesis_status OWNER TO postgres;

--
-- TOC entry 875 (class 1247 OID 16390)
-- Name: user_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_type AS ENUM (
    'professor',
    'student',
    'secretary'
);


ALTER TYPE public.user_type OWNER TO postgres;

--
-- TOC entry 246 (class 1255 OID 16702)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 222 (class 1259 OID 16464)
-- Name: professors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.professors (
    id integer NOT NULL,
    user_id integer,
    office_location character varying(100),
    phone character varying(20),
    specialization text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.professors OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 16446)
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students (
    id integer NOT NULL,
    user_id integer,
    student_id character varying(20) NOT NULL,
    phone_mobile character varying(20),
    phone_landline character varying(20),
    address text,
    contact_email character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.students OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 16480)
-- Name: thesis_topics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_topics (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    detailed_description_file character varying(255),
    supervisor_id integer,
    is_available boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.thesis_topics OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 16497)
-- Name: thesis_works; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_works (
    id integer NOT NULL,
    topic_id integer,
    student_id integer,
    supervisor_id integer,
    status public.thesis_status DEFAULT 'under_assignment'::public.thesis_status,
    assigned_at timestamp without time zone,
    activated_at timestamp without time zone,
    examination_started_at timestamp without time zone,
    completed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    general_assembly_number character varying(20),
    general_assembly_year integer,
    cancellation_reason text,
    cancelled_by public.user_type,
    final_grade numeric(4,2),
    repository_link character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.thesis_works OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 16430)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email character varying(100) NOT NULL,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    user_type public.user_type NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 16713)
-- Name: active_thesis_overview; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.active_thesis_overview AS
 SELECT tw.id,
    tt.title AS topic_title,
    tt.description AS topic_description,
    concat(su.first_name, ' ', su.last_name) AS student_name,
    st.student_id,
    concat(pu.first_name, ' ', pu.last_name) AS supervisor_name,
    tw.status,
    tw.assigned_at,
    tw.activated_at,
    tw.general_assembly_number,
    tw.general_assembly_year
   FROM (((((public.thesis_works tw
     JOIN public.thesis_topics tt ON ((tw.topic_id = tt.id)))
     JOIN public.students st ON ((tw.student_id = st.id)))
     JOIN public.users su ON ((st.user_id = su.id)))
     JOIN public.professors pr ON ((tw.supervisor_id = pr.id)))
     JOIN public.users pu ON ((pr.user_id = pu.id)))
  WHERE (tw.status = ANY (ARRAY['under_assignment'::public.thesis_status, 'active'::public.thesis_status, 'under_examination'::public.thesis_status]));


ALTER VIEW public.active_thesis_overview OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16463)
-- Name: professors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.professors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.professors_id_seq OWNER TO postgres;

--
-- TOC entry 5131 (class 0 OID 0)
-- Dependencies: 221
-- Name: professors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.professors_id_seq OWNED BY public.professors.id;


--
-- TOC entry 242 (class 1259 OID 16664)
-- Name: public_announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.public_announcements (
    id integer NOT NULL,
    thesis_id integer,
    title character varying(200) NOT NULL,
    content text NOT NULL,
    presentation_date timestamp without time zone,
    location character varying(200),
    meeting_link character varying(500),
    published_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true
);


ALTER TABLE public.public_announcements OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 16663)
-- Name: public_announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.public_announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.public_announcements_id_seq OWNER TO postgres;

--
-- TOC entry 5132 (class 0 OID 0)
-- Dependencies: 241
-- Name: public_announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.public_announcements_id_seq OWNED BY public.public_announcements.id;


--
-- TOC entry 219 (class 1259 OID 16445)
-- Name: students_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.students_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.students_id_seq OWNER TO postgres;

--
-- TOC entry 5133 (class 0 OID 0)
-- Dependencies: 219
-- Name: students_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.students_id_seq OWNED BY public.students.id;


--
-- TOC entry 228 (class 1259 OID 16524)
-- Name: thesis_committee_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_committee_members (
    id integer NOT NULL,
    thesis_id integer,
    professor_id integer,
    role public.committee_role NOT NULL,
    invited_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    responded_at timestamp without time zone,
    status public.invitation_status DEFAULT 'pending'::public.invitation_status
);


ALTER TABLE public.thesis_committee_members OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16523)
-- Name: thesis_committee_members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_committee_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_committee_members_id_seq OWNER TO postgres;

--
-- TOC entry 5134 (class 0 OID 0)
-- Dependencies: 227
-- Name: thesis_committee_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_committee_members_id_seq OWNED BY public.thesis_committee_members.id;


--
-- TOC entry 245 (class 1259 OID 16718)
-- Name: thesis_committees; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.thesis_committees AS
 SELECT tw.id AS thesis_id,
    tt.title AS thesis_title,
    concat(su.first_name, ' ', su.last_name) AS student_name,
    tcm.role,
    concat(pu.first_name, ' ', pu.last_name) AS professor_name,
    tcm.status AS invitation_status,
    tcm.invited_at,
    tcm.responded_at
   FROM ((((((public.thesis_works tw
     JOIN public.thesis_topics tt ON ((tw.topic_id = tt.id)))
     JOIN public.students st ON ((tw.student_id = st.id)))
     JOIN public.users su ON ((st.user_id = su.id)))
     JOIN public.thesis_committee_members tcm ON ((tw.id = tcm.thesis_id)))
     JOIN public.professors pr ON ((tcm.professor_id = pr.id)))
     JOIN public.users pu ON ((pr.user_id = pu.id)))
  ORDER BY tw.id, tcm.role;


ALTER VIEW public.thesis_committees OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 16586)
-- Name: thesis_external_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_external_links (
    id integer NOT NULL,
    thesis_id integer,
    link_url character varying(500) NOT NULL,
    link_description character varying(200),
    added_by integer,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.thesis_external_links OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 16585)
-- Name: thesis_external_links_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_external_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_external_links_id_seq OWNER TO postgres;

--
-- TOC entry 5135 (class 0 OID 0)
-- Dependencies: 233
-- Name: thesis_external_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_external_links_id_seq OWNED BY public.thesis_external_links.id;


--
-- TOC entry 232 (class 1259 OID 16566)
-- Name: thesis_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_files (
    id integer NOT NULL,
    thesis_id integer,
    file_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_type character varying(50),
    uploaded_by integer,
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.thesis_files OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16565)
-- Name: thesis_files_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_files_id_seq OWNER TO postgres;

--
-- TOC entry 5136 (class 0 OID 0)
-- Dependencies: 231
-- Name: thesis_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_files_id_seq OWNED BY public.thesis_files.id;


--
-- TOC entry 238 (class 1259 OID 16622)
-- Name: thesis_grades; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_grades (
    id integer NOT NULL,
    thesis_id integer,
    professor_id integer,
    implementation_grade numeric(4,2),
    presentation_grade numeric(4,2),
    innovation_grade numeric(4,2),
    bibliography_grade numeric(4,2),
    writing_grade numeric(4,2),
    total_grade numeric(4,2) NOT NULL,
    comments text,
    graded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.thesis_grades OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 16621)
-- Name: thesis_grades_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_grades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_grades_id_seq OWNER TO postgres;

--
-- TOC entry 5137 (class 0 OID 0)
-- Dependencies: 237
-- Name: thesis_grades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_grades_id_seq OWNED BY public.thesis_grades.id;


--
-- TOC entry 230 (class 1259 OID 16545)
-- Name: thesis_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_notes (
    id integer NOT NULL,
    thesis_id integer,
    professor_id integer,
    note_text text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT thesis_notes_note_text_check CHECK ((length(note_text) <= 300))
);


ALTER TABLE public.thesis_notes OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16544)
-- Name: thesis_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_notes_id_seq OWNER TO postgres;

--
-- TOC entry 5138 (class 0 OID 0)
-- Dependencies: 229
-- Name: thesis_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_notes_id_seq OWNED BY public.thesis_notes.id;


--
-- TOC entry 236 (class 1259 OID 16606)
-- Name: thesis_presentations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_presentations (
    id integer NOT NULL,
    thesis_id integer,
    presentation_date timestamp without time zone NOT NULL,
    examination_type public.examination_type NOT NULL,
    room_location character varying(100),
    meeting_link character varying(500),
    announcement_text text,
    announcement_generated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.thesis_presentations OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 16605)
-- Name: thesis_presentations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_presentations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_presentations_id_seq OWNER TO postgres;

--
-- TOC entry 5139 (class 0 OID 0)
-- Dependencies: 235
-- Name: thesis_presentations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_presentations_id_seq OWNED BY public.thesis_presentations.id;


--
-- TOC entry 240 (class 1259 OID 16644)
-- Name: thesis_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.thesis_status_history (
    id integer NOT NULL,
    thesis_id integer,
    from_status public.thesis_status,
    to_status public.thesis_status NOT NULL,
    changed_by integer,
    change_reason text,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.thesis_status_history OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 16643)
-- Name: thesis_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_status_history_id_seq OWNER TO postgres;

--
-- TOC entry 5140 (class 0 OID 0)
-- Dependencies: 239
-- Name: thesis_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_status_history_id_seq OWNED BY public.thesis_status_history.id;


--
-- TOC entry 223 (class 1259 OID 16479)
-- Name: thesis_topics_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_topics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_topics_id_seq OWNER TO postgres;

--
-- TOC entry 5141 (class 0 OID 0)
-- Dependencies: 223
-- Name: thesis_topics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_topics_id_seq OWNED BY public.thesis_topics.id;


--
-- TOC entry 225 (class 1259 OID 16496)
-- Name: thesis_works_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.thesis_works_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.thesis_works_id_seq OWNER TO postgres;

--
-- TOC entry 5142 (class 0 OID 0)
-- Dependencies: 225
-- Name: thesis_works_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.thesis_works_id_seq OWNED BY public.thesis_works.id;


--
-- TOC entry 243 (class 1259 OID 16708)
-- Name: user_profiles; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.user_profiles AS
 SELECT u.id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.user_type,
        CASE
            WHEN (u.user_type = 'student'::public.user_type) THEN s.student_id
            ELSE NULL::character varying
        END AS student_id,
        CASE
            WHEN (u.user_type = 'professor'::public.user_type) THEN p.specialization
            ELSE NULL::text
        END AS specialization,
    u.created_at,
    u.is_active
   FROM ((public.users u
     LEFT JOIN public.students s ON ((u.id = s.user_id)))
     LEFT JOIN public.professors p ON ((u.id = p.user_id)));


ALTER VIEW public.user_profiles OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 16429)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- TOC entry 5143 (class 0 OID 0)
-- Dependencies: 217
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 4837 (class 2604 OID 16467)
-- Name: professors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.professors ALTER COLUMN id SET DEFAULT nextval('public.professors_id_seq'::regclass);


--
-- TOC entry 4864 (class 2604 OID 16667)
-- Name: public_announcements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_announcements ALTER COLUMN id SET DEFAULT nextval('public.public_announcements_id_seq'::regclass);


--
-- TOC entry 4834 (class 2604 OID 16449)
-- Name: students id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students ALTER COLUMN id SET DEFAULT nextval('public.students_id_seq'::regclass);


--
-- TOC entry 4848 (class 2604 OID 16527)
-- Name: thesis_committee_members id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_committee_members ALTER COLUMN id SET DEFAULT nextval('public.thesis_committee_members_id_seq'::regclass);


--
-- TOC entry 4855 (class 2604 OID 16589)
-- Name: thesis_external_links id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_external_links ALTER COLUMN id SET DEFAULT nextval('public.thesis_external_links_id_seq'::regclass);


--
-- TOC entry 4853 (class 2604 OID 16569)
-- Name: thesis_files id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_files ALTER COLUMN id SET DEFAULT nextval('public.thesis_files_id_seq'::regclass);


--
-- TOC entry 4860 (class 2604 OID 16625)
-- Name: thesis_grades id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_grades ALTER COLUMN id SET DEFAULT nextval('public.thesis_grades_id_seq'::regclass);


--
-- TOC entry 4851 (class 2604 OID 16548)
-- Name: thesis_notes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_notes ALTER COLUMN id SET DEFAULT nextval('public.thesis_notes_id_seq'::regclass);


--
-- TOC entry 4857 (class 2604 OID 16609)
-- Name: thesis_presentations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_presentations ALTER COLUMN id SET DEFAULT nextval('public.thesis_presentations_id_seq'::regclass);


--
-- TOC entry 4862 (class 2604 OID 16647)
-- Name: thesis_status_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_status_history ALTER COLUMN id SET DEFAULT nextval('public.thesis_status_history_id_seq'::regclass);


--
-- TOC entry 4840 (class 2604 OID 16483)
-- Name: thesis_topics id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_topics ALTER COLUMN id SET DEFAULT nextval('public.thesis_topics_id_seq'::regclass);


--
-- TOC entry 4844 (class 2604 OID 16500)
-- Name: thesis_works id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_works ALTER COLUMN id SET DEFAULT nextval('public.thesis_works_id_seq'::regclass);


--
-- TOC entry 4830 (class 2604 OID 16433)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 5105 (class 0 OID 16464)
-- Dependencies: 222
-- Data for Name: professors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.professors (id, user_id, office_location, phone, specialization, created_at, updated_at) FROM stdin;
1	1	Room 101	210-1234567	Machine Learning	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296
2	2	Room 102	210-1234568	Database Systems	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296
3	3	Room 103	210-1234569	Software Engineering	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296
\.


--
-- TOC entry 5125 (class 0 OID 16664)
-- Dependencies: 242
-- Data for Name: public_announcements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.public_announcements (id, thesis_id, title, content, presentation_date, location, meeting_link, published_at, is_active) FROM stdin;
\.


--
-- TOC entry 5103 (class 0 OID 16446)
-- Dependencies: 220
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.students (id, user_id, student_id, phone_mobile, phone_landline, address, contact_email, created_at, updated_at) FROM stdin;
1	4	AM001	6901234567	\N	Athens, Greece	alice.wilson@student.edu	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296
2	5	AM002	6901234568	\N	Thessaloniki, Greece	bob.johnson@student.edu	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296
\.


--
-- TOC entry 5111 (class 0 OID 16524)
-- Dependencies: 228
-- Data for Name: thesis_committee_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_committee_members (id, thesis_id, professor_id, role, invited_at, responded_at, status) FROM stdin;
\.


--
-- TOC entry 5117 (class 0 OID 16586)
-- Dependencies: 234
-- Data for Name: thesis_external_links; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_external_links (id, thesis_id, link_url, link_description, added_by, added_at) FROM stdin;
\.


--
-- TOC entry 5115 (class 0 OID 16566)
-- Dependencies: 232
-- Data for Name: thesis_files; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_files (id, thesis_id, file_name, file_path, file_type, uploaded_by, uploaded_at) FROM stdin;
\.


--
-- TOC entry 5121 (class 0 OID 16622)
-- Dependencies: 238
-- Data for Name: thesis_grades; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_grades (id, thesis_id, professor_id, implementation_grade, presentation_grade, innovation_grade, bibliography_grade, writing_grade, total_grade, comments, graded_at) FROM stdin;
\.


--
-- TOC entry 5113 (class 0 OID 16545)
-- Dependencies: 230
-- Data for Name: thesis_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_notes (id, thesis_id, professor_id, note_text, created_at) FROM stdin;
\.


--
-- TOC entry 5119 (class 0 OID 16606)
-- Dependencies: 236
-- Data for Name: thesis_presentations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_presentations (id, thesis_id, presentation_date, examination_type, room_location, meeting_link, announcement_text, announcement_generated_at, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5123 (class 0 OID 16644)
-- Dependencies: 240
-- Data for Name: thesis_status_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_status_history (id, thesis_id, from_status, to_status, changed_by, change_reason, changed_at) FROM stdin;
\.


--
-- TOC entry 5107 (class 0 OID 16480)
-- Dependencies: 224
-- Data for Name: thesis_topics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_topics (id, title, description, detailed_description_file, supervisor_id, is_available, created_at, updated_at) FROM stdin;
1	AI-based Recommendation System	Development of a recommendation system using machine learning algorithms	\N	1	t	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296
2	Database Optimization Techniques	Research on advanced database optimization methods	\N	2	t	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296
3	Web Application Security	Analysis of modern web application security vulnerabilities	\N	3	t	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296
\.


--
-- TOC entry 5109 (class 0 OID 16497)
-- Dependencies: 226
-- Data for Name: thesis_works; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.thesis_works (id, topic_id, student_id, supervisor_id, status, assigned_at, activated_at, examination_started_at, completed_at, cancelled_at, general_assembly_number, general_assembly_year, cancellation_reason, cancelled_by, final_grade, repository_link, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5101 (class 0 OID 16430)
-- Dependencies: 218
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, password_hash, email, first_name, last_name, user_type, created_at, updated_at, is_active) FROM stdin;
1	prof_smith	$2b$12$hash1	smith@university.edu	John	Smith	professor	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296	t
2	prof_jones	$2b$12$hash2	jones@university.edu	Mary	Jones	professor	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296	t
3	prof_brown	$2b$12$hash3	brown@university.edu	Robert	Brown	professor	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296	t
4	student001	$2b$12$hash4	student1@student.edu	Alice	Wilson	student	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296	t
5	student002	$2b$12$hash5	student2@student.edu	Bob	Johnson	student	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296	t
6	secretary	$2b$12$hash6	secretary@university.edu	Admin	Secretary	secretary	2025-07-09 13:32:53.087296	2025-07-09 13:32:53.087296	t
\.


--
-- TOC entry 5144 (class 0 OID 0)
-- Dependencies: 221
-- Name: professors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.professors_id_seq', 3, true);


--
-- TOC entry 5145 (class 0 OID 0)
-- Dependencies: 241
-- Name: public_announcements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.public_announcements_id_seq', 1, false);


--
-- TOC entry 5146 (class 0 OID 0)
-- Dependencies: 219
-- Name: students_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.students_id_seq', 2, true);


--
-- TOC entry 5147 (class 0 OID 0)
-- Dependencies: 227
-- Name: thesis_committee_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_committee_members_id_seq', 1, false);


--
-- TOC entry 5148 (class 0 OID 0)
-- Dependencies: 233
-- Name: thesis_external_links_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_external_links_id_seq', 1, false);


--
-- TOC entry 5149 (class 0 OID 0)
-- Dependencies: 231
-- Name: thesis_files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_files_id_seq', 1, false);


--
-- TOC entry 5150 (class 0 OID 0)
-- Dependencies: 237
-- Name: thesis_grades_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_grades_id_seq', 1, false);


--
-- TOC entry 5151 (class 0 OID 0)
-- Dependencies: 229
-- Name: thesis_notes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_notes_id_seq', 1, false);


--
-- TOC entry 5152 (class 0 OID 0)
-- Dependencies: 235
-- Name: thesis_presentations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_presentations_id_seq', 1, false);


--
-- TOC entry 5153 (class 0 OID 0)
-- Dependencies: 239
-- Name: thesis_status_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_status_history_id_seq', 1, false);


--
-- TOC entry 5154 (class 0 OID 0)
-- Dependencies: 223
-- Name: thesis_topics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_topics_id_seq', 3, true);


--
-- TOC entry 5155 (class 0 OID 0)
-- Dependencies: 225
-- Name: thesis_works_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.thesis_works_id_seq', 1, false);


--
-- TOC entry 5156 (class 0 OID 0)
-- Dependencies: 217
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 6, true);


--
-- TOC entry 4885 (class 2606 OID 16473)
-- Name: professors professors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.professors
    ADD CONSTRAINT professors_pkey PRIMARY KEY (id);


--
-- TOC entry 4926 (class 2606 OID 16673)
-- Name: public_announcements public_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_announcements
    ADD CONSTRAINT public_announcements_pkey PRIMARY KEY (id);


--
-- TOC entry 4880 (class 2606 OID 16455)
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- TOC entry 4882 (class 2606 OID 16457)
-- Name: students students_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_student_id_key UNIQUE (student_id);


--
-- TOC entry 4900 (class 2606 OID 16531)
-- Name: thesis_committee_members thesis_committee_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_committee_members
    ADD CONSTRAINT thesis_committee_members_pkey PRIMARY KEY (id);


--
-- TOC entry 4902 (class 2606 OID 16533)
-- Name: thesis_committee_members thesis_committee_members_thesis_id_professor_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_committee_members
    ADD CONSTRAINT thesis_committee_members_thesis_id_professor_id_key UNIQUE (thesis_id, professor_id);


--
-- TOC entry 4910 (class 2606 OID 16594)
-- Name: thesis_external_links thesis_external_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_external_links
    ADD CONSTRAINT thesis_external_links_pkey PRIMARY KEY (id);


--
-- TOC entry 4908 (class 2606 OID 16574)
-- Name: thesis_files thesis_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_files
    ADD CONSTRAINT thesis_files_pkey PRIMARY KEY (id);


--
-- TOC entry 4916 (class 2606 OID 16630)
-- Name: thesis_grades thesis_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_grades
    ADD CONSTRAINT thesis_grades_pkey PRIMARY KEY (id);


--
-- TOC entry 4918 (class 2606 OID 16632)
-- Name: thesis_grades thesis_grades_thesis_id_professor_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_grades
    ADD CONSTRAINT thesis_grades_thesis_id_professor_id_key UNIQUE (thesis_id, professor_id);


--
-- TOC entry 4906 (class 2606 OID 16554)
-- Name: thesis_notes thesis_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_notes
    ADD CONSTRAINT thesis_notes_pkey PRIMARY KEY (id);


--
-- TOC entry 4912 (class 2606 OID 16615)
-- Name: thesis_presentations thesis_presentations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_presentations
    ADD CONSTRAINT thesis_presentations_pkey PRIMARY KEY (id);


--
-- TOC entry 4922 (class 2606 OID 16652)
-- Name: thesis_status_history thesis_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_status_history
    ADD CONSTRAINT thesis_status_history_pkey PRIMARY KEY (id);


--
-- TOC entry 4889 (class 2606 OID 16490)
-- Name: thesis_topics thesis_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_topics
    ADD CONSTRAINT thesis_topics_pkey PRIMARY KEY (id);


--
-- TOC entry 4895 (class 2606 OID 16507)
-- Name: thesis_works thesis_works_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_works
    ADD CONSTRAINT thesis_works_pkey PRIMARY KEY (id);


--
-- TOC entry 4872 (class 2606 OID 16444)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4874 (class 2606 OID 16440)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4876 (class 2606 OID 16442)
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- TOC entry 4923 (class 1259 OID 16701)
-- Name: idx_announcements_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcements_active ON public.public_announcements USING btree (is_active);


--
-- TOC entry 4924 (class 1259 OID 16700)
-- Name: idx_announcements_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcements_date ON public.public_announcements USING btree (published_at);


--
-- TOC entry 4896 (class 1259 OID 16692)
-- Name: idx_committee_members_professor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_committee_members_professor ON public.thesis_committee_members USING btree (professor_id);


--
-- TOC entry 4897 (class 1259 OID 16693)
-- Name: idx_committee_members_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_committee_members_status ON public.thesis_committee_members USING btree (status);


--
-- TOC entry 4898 (class 1259 OID 16691)
-- Name: idx_committee_members_thesis; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_committee_members_thesis ON public.thesis_committee_members USING btree (thesis_id);


--
-- TOC entry 4883 (class 1259 OID 16684)
-- Name: idx_professors_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_professors_user_id ON public.professors USING btree (user_id);


--
-- TOC entry 4919 (class 1259 OID 16699)
-- Name: idx_status_history_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_status_history_date ON public.thesis_status_history USING btree (changed_at);


--
-- TOC entry 4920 (class 1259 OID 16698)
-- Name: idx_status_history_thesis; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_status_history_thesis ON public.thesis_status_history USING btree (thesis_id);


--
-- TOC entry 4877 (class 1259 OID 16682)
-- Name: idx_students_student_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_student_id ON public.students USING btree (student_id);


--
-- TOC entry 4878 (class 1259 OID 16683)
-- Name: idx_students_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_user_id ON public.students USING btree (user_id);


--
-- TOC entry 4913 (class 1259 OID 16697)
-- Name: idx_thesis_grades_professor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_grades_professor ON public.thesis_grades USING btree (professor_id);


--
-- TOC entry 4914 (class 1259 OID 16696)
-- Name: idx_thesis_grades_thesis; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_grades_thesis ON public.thesis_grades USING btree (thesis_id);


--
-- TOC entry 4903 (class 1259 OID 16695)
-- Name: idx_thesis_notes_professor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_notes_professor ON public.thesis_notes USING btree (professor_id);


--
-- TOC entry 4904 (class 1259 OID 16694)
-- Name: idx_thesis_notes_thesis; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_notes_thesis ON public.thesis_notes USING btree (thesis_id);


--
-- TOC entry 4886 (class 1259 OID 16686)
-- Name: idx_thesis_topics_available; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_topics_available ON public.thesis_topics USING btree (is_available);


--
-- TOC entry 4887 (class 1259 OID 16685)
-- Name: idx_thesis_topics_supervisor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_topics_supervisor ON public.thesis_topics USING btree (supervisor_id);


--
-- TOC entry 4890 (class 1259 OID 16690)
-- Name: idx_thesis_works_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_works_dates ON public.thesis_works USING btree (assigned_at, activated_at, completed_at);


--
-- TOC entry 4891 (class 1259 OID 16687)
-- Name: idx_thesis_works_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_works_status ON public.thesis_works USING btree (status);


--
-- TOC entry 4892 (class 1259 OID 16688)
-- Name: idx_thesis_works_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_works_student ON public.thesis_works USING btree (student_id);


--
-- TOC entry 4893 (class 1259 OID 16689)
-- Name: idx_thesis_works_supervisor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_thesis_works_supervisor ON public.thesis_works USING btree (supervisor_id);


--
-- TOC entry 4868 (class 1259 OID 16680)
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- TOC entry 4869 (class 1259 OID 16681)
-- Name: idx_users_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_type ON public.users USING btree (user_type);


--
-- TOC entry 4870 (class 1259 OID 16679)
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- TOC entry 4949 (class 2620 OID 16705)
-- Name: professors update_professors_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_professors_updated_at BEFORE UPDATE ON public.professors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4948 (class 2620 OID 16704)
-- Name: students update_students_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4950 (class 2620 OID 16706)
-- Name: thesis_topics update_thesis_topics_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_thesis_topics_updated_at BEFORE UPDATE ON public.thesis_topics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4951 (class 2620 OID 16707)
-- Name: thesis_works update_thesis_works_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_thesis_works_updated_at BEFORE UPDATE ON public.thesis_works FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4947 (class 2620 OID 16703)
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4928 (class 2606 OID 16474)
-- Name: professors professors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.professors
    ADD CONSTRAINT professors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4946 (class 2606 OID 16674)
-- Name: public_announcements public_announcements_thesis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_announcements
    ADD CONSTRAINT public_announcements_thesis_id_fkey FOREIGN KEY (thesis_id) REFERENCES public.thesis_works(id) ON DELETE CASCADE;


--
-- TOC entry 4927 (class 2606 OID 16458)
-- Name: students students_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4933 (class 2606 OID 16539)
-- Name: thesis_committee_members thesis_committee_members_professor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_committee_members
    ADD CONSTRAINT thesis_committee_members_professor_id_fkey FOREIGN KEY (professor_id) REFERENCES public.professors(id) ON DELETE CASCADE;


--
-- TOC entry 4934 (class 2606 OID 16534)
-- Name: thesis_committee_members thesis_committee_members_thesis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_committee_members
    ADD CONSTRAINT thesis_committee_members_thesis_id_fkey FOREIGN KEY (thesis_id) REFERENCES public.thesis_works(id) ON DELETE CASCADE;


--
-- TOC entry 4939 (class 2606 OID 16600)
-- Name: thesis_external_links thesis_external_links_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_external_links
    ADD CONSTRAINT thesis_external_links_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- TOC entry 4940 (class 2606 OID 16595)
-- Name: thesis_external_links thesis_external_links_thesis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_external_links
    ADD CONSTRAINT thesis_external_links_thesis_id_fkey FOREIGN KEY (thesis_id) REFERENCES public.thesis_works(id) ON DELETE CASCADE;


--
-- TOC entry 4937 (class 2606 OID 16575)
-- Name: thesis_files thesis_files_thesis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_files
    ADD CONSTRAINT thesis_files_thesis_id_fkey FOREIGN KEY (thesis_id) REFERENCES public.thesis_works(id) ON DELETE CASCADE;


--
-- TOC entry 4938 (class 2606 OID 16580)
-- Name: thesis_files thesis_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_files
    ADD CONSTRAINT thesis_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- TOC entry 4942 (class 2606 OID 16638)
-- Name: thesis_grades thesis_grades_professor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_grades
    ADD CONSTRAINT thesis_grades_professor_id_fkey FOREIGN KEY (professor_id) REFERENCES public.professors(id) ON DELETE CASCADE;


--
-- TOC entry 4943 (class 2606 OID 16633)
-- Name: thesis_grades thesis_grades_thesis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_grades
    ADD CONSTRAINT thesis_grades_thesis_id_fkey FOREIGN KEY (thesis_id) REFERENCES public.thesis_works(id) ON DELETE CASCADE;


--
-- TOC entry 4935 (class 2606 OID 16560)
-- Name: thesis_notes thesis_notes_professor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_notes
    ADD CONSTRAINT thesis_notes_professor_id_fkey FOREIGN KEY (professor_id) REFERENCES public.professors(id) ON DELETE CASCADE;


--
-- TOC entry 4936 (class 2606 OID 16555)
-- Name: thesis_notes thesis_notes_thesis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_notes
    ADD CONSTRAINT thesis_notes_thesis_id_fkey FOREIGN KEY (thesis_id) REFERENCES public.thesis_works(id) ON DELETE CASCADE;


--
-- TOC entry 4941 (class 2606 OID 16616)
-- Name: thesis_presentations thesis_presentations_thesis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_presentations
    ADD CONSTRAINT thesis_presentations_thesis_id_fkey FOREIGN KEY (thesis_id) REFERENCES public.thesis_works(id) ON DELETE CASCADE;


--
-- TOC entry 4944 (class 2606 OID 16658)
-- Name: thesis_status_history thesis_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_status_history
    ADD CONSTRAINT thesis_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- TOC entry 4945 (class 2606 OID 16653)
-- Name: thesis_status_history thesis_status_history_thesis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_status_history
    ADD CONSTRAINT thesis_status_history_thesis_id_fkey FOREIGN KEY (thesis_id) REFERENCES public.thesis_works(id) ON DELETE CASCADE;


--
-- TOC entry 4929 (class 2606 OID 16491)
-- Name: thesis_topics thesis_topics_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_topics
    ADD CONSTRAINT thesis_topics_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.professors(id) ON DELETE CASCADE;


--
-- TOC entry 4930 (class 2606 OID 16513)
-- Name: thesis_works thesis_works_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_works
    ADD CONSTRAINT thesis_works_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- TOC entry 4931 (class 2606 OID 16518)
-- Name: thesis_works thesis_works_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_works
    ADD CONSTRAINT thesis_works_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.professors(id) ON DELETE CASCADE;


--
-- TOC entry 4932 (class 2606 OID 16508)
-- Name: thesis_works thesis_works_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.thesis_works
    ADD CONSTRAINT thesis_works_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.thesis_topics(id) ON DELETE CASCADE;


-- Completed on 2025-08-05 15:46:02

--
-- PostgreSQL database dump complete
--

