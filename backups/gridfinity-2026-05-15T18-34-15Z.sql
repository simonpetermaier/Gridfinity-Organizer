--
-- PostgreSQL database dump
--

\restrict LUkNIdqaBQXNnvVLkOmcTiwHu42cjbD5SgfKLvGbIDGUOmD33cR9AWwkR2RtfkR

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.bins DROP CONSTRAINT IF EXISTS bins_location_id_fkey;
ALTER TABLE IF EXISTS ONLY public.bins DROP CONSTRAINT IF EXISTS bins_content_type_id_fkey;
ALTER TABLE IF EXISTS ONLY public.bins DROP CONSTRAINT IF EXISTS bins_box_type_id_fkey;
DROP INDEX IF EXISTS public.idx_bins_location;
DROP INDEX IF EXISTS public.idx_bins_content_type_id;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_pkey;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_cabinet_id_drawer_id_key;
ALTER TABLE IF EXISTS ONLY public.content_types DROP CONSTRAINT IF EXISTS content_types_pkey;
ALTER TABLE IF EXISTS ONLY public.content_types DROP CONSTRAINT IF EXISTS content_types_name_key;
ALTER TABLE IF EXISTS ONLY public.box_types DROP CONSTRAINT IF EXISTS box_types_pkey;
ALTER TABLE IF EXISTS ONLY public.box_types DROP CONSTRAINT IF EXISTS box_types_name_key;
ALTER TABLE IF EXISTS ONLY public.bins DROP CONSTRAINT IF EXISTS bins_pkey;
ALTER TABLE IF EXISTS ONLY public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE IF EXISTS public.locations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.content_types ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.box_types ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.bins ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.locations_id_seq;
DROP TABLE IF EXISTS public.locations;
DROP SEQUENCE IF EXISTS public.content_types_id_seq;
DROP TABLE IF EXISTS public.content_types;
DROP SEQUENCE IF EXISTS public.box_types_id_seq;
DROP TABLE IF EXISTS public.box_types;
DROP SEQUENCE IF EXISTS public.bins_id_seq;
DROP TABLE IF EXISTS public.bins;
DROP TABLE IF EXISTS public.app_settings;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key character varying(64) NOT NULL,
    value text
);


--
-- Name: bins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bins (
    id integer NOT NULL,
    location_id integer,
    grid_x integer,
    grid_y integer,
    grid_width integer DEFAULT 1 NOT NULL,
    grid_length integer DEFAULT 1 NOT NULL,
    height_u integer DEFAULT 3 NOT NULL,
    box_type_id integer,
    attribute character varying(255),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    content_type_id integer
);


--
-- Name: bins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bins_id_seq OWNED BY public.bins.id;


--
-- Name: box_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.box_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    grid_width integer DEFAULT 1 NOT NULL,
    grid_length integer DEFAULT 1 NOT NULL,
    grid_height_u integer DEFAULT 3 NOT NULL,
    is_divided boolean DEFAULT false,
    compartments integer DEFAULT 1,
    description text
);


--
-- Name: box_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.box_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: box_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.box_types_id_seq OWNED BY public.box_types.id;


--
-- Name: content_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL
);


--
-- Name: content_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.content_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: content_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.content_types_id_seq OWNED BY public.content_types.id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id integer NOT NULL,
    cabinet_id character varying(100) NOT NULL,
    drawer_id character varying(100) NOT NULL,
    grid_columns integer DEFAULT 5 NOT NULL,
    grid_rows integer DEFAULT 5 NOT NULL,
    vertical_space_u integer DEFAULT 6 NOT NULL,
    attributes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: bins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins ALTER COLUMN id SET DEFAULT nextval('public.bins_id_seq'::regclass);


--
-- Name: box_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_types ALTER COLUMN id SET DEFAULT nextval('public.box_types_id_seq'::regclass);


--
-- Name: content_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_types ALTER COLUMN id SET DEFAULT nextval('public.content_types_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_settings (key, value) FROM stdin;
qr_payload_mode	url
\.


--
-- Data for Name: bins; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bins (id, location_id, grid_x, grid_y, grid_width, grid_length, height_u, box_type_id, attribute, notes, created_at, updated_at, content_type_id) FROM stdin;
1	1	3	1	1	1	3	1	M5x30		2026-05-14 13:58:30.683198	2026-05-14 13:59:33.408286	1
3	1	4	0	2	2	8	6	m4		2026-05-14 14:07:00.266971	2026-05-14 14:07:00.266971	4
2	1	0	0	4	1	3	8	M5		2026-05-14 14:00:31.947897	2026-05-15 17:43:28.6234	2
\.


--
-- Data for Name: box_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.box_types (id, name, grid_width, grid_length, grid_height_u, is_divided, compartments, description) FROM stdin;
1	1×1×3	1	1	3	f	1	Standard small bin
2	1×2×3	1	2	3	f	1	Standard medium bin
3	2×2×3	2	2	3	f	1	Standard large bin
4	2×4×3	2	4	3	f	1	Long bin
5	1×2×6	1	2	6	f	1	Tall medium bin
6	2×2×6	2	2	6	f	1	Tall large bin
7	1×2 Div×3	1	2	3	t	2	Divided 2-compartment bin
8	1×4 Div×3	1	4	3	t	4	Divided 4-compartment bin
9	Toolcrest 3×5	3	5	6	f	1	Deep tool holder
\.


--
-- Data for Name: content_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.content_types (id, name) FROM stdin;
1	Bolt
2	Nut
3	Washer
4	Screw
5	Connector
6	Cable
7	Tool
8	Electronics
9	Spring
10	Bearing
11	Insert
\.


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.locations (id, cabinet_id, drawer_id, grid_columns, grid_rows, vertical_space_u, attributes, created_at) FROM stdin;
1	Cabinet A	Drawer 1	7	5	6	Bolts & Screws	2026-05-14 13:56:53.984658
2	Cabinet A	Drawer 2	7	5	6	Nuts & Washers	2026-05-14 13:56:53.984658
3	Cabinet B	Drawer 1	5	3	9	Tools & Pliers	2026-05-14 13:56:53.984658
4	Cabinet B	Drawer 2	5	3	6	Connectors & Cables	2026-05-14 13:56:53.984658
5	Cabinet C	Drawer 1	5	5	6		2026-05-14 19:48:23.352507
\.


--
-- Name: bins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bins_id_seq', 4, true);


--
-- Name: box_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.box_types_id_seq', 9, true);


--
-- Name: content_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.content_types_id_seq', 15, true);


--
-- Name: locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.locations_id_seq', 5, true);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: bins bins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins
    ADD CONSTRAINT bins_pkey PRIMARY KEY (id);


--
-- Name: box_types box_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_types
    ADD CONSTRAINT box_types_name_key UNIQUE (name);


--
-- Name: box_types box_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.box_types
    ADD CONSTRAINT box_types_pkey PRIMARY KEY (id);


--
-- Name: content_types content_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_types
    ADD CONSTRAINT content_types_name_key UNIQUE (name);


--
-- Name: content_types content_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_types
    ADD CONSTRAINT content_types_pkey PRIMARY KEY (id);


--
-- Name: locations locations_cabinet_id_drawer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_cabinet_id_drawer_id_key UNIQUE (cabinet_id, drawer_id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: idx_bins_content_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bins_content_type_id ON public.bins USING btree (content_type_id);


--
-- Name: idx_bins_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bins_location ON public.bins USING btree (location_id);


--
-- Name: bins bins_box_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins
    ADD CONSTRAINT bins_box_type_id_fkey FOREIGN KEY (box_type_id) REFERENCES public.box_types(id) ON DELETE SET NULL;


--
-- Name: bins bins_content_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins
    ADD CONSTRAINT bins_content_type_id_fkey FOREIGN KEY (content_type_id) REFERENCES public.content_types(id) ON DELETE SET NULL;


--
-- Name: bins bins_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins
    ADD CONSTRAINT bins_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict LUkNIdqaBQXNnvVLkOmcTiwHu42cjbD5SgfKLvGbIDGUOmD33cR9AWwkR2RtfkR

