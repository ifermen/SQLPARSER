--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SELECT pg_catalog.set_config('search_path', '', false);

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TYPE public.post_status AS ENUM (
    'draft',
    'published'
);

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.author (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    display_name text,
    external_id uuid DEFAULT public.uuid_generate_v4() NOT NULL
);

ALTER TABLE public.author OWNER TO postgres;

CREATE SEQUENCE public.author_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.author_id_seq OWNED BY public.author.id;

CREATE TABLE public.post (
    id bigint NOT NULL,
    author_id integer NOT NULL,
    title character varying(200) NOT NULL,
    status public.post_status DEFAULT 'draft'::public.post_status NOT NULL,
    tags text[],
    metadata jsonb,
    published_at timestamp(6) with time zone,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE VIEW public.published_post AS
 SELECT post.id, post.title
   FROM public.post
  WHERE (post.status = 'published'::public.post_status);

ALTER TABLE ONLY public.author ALTER COLUMN id SET DEFAULT nextval('public.author_id_seq'::regclass);

ALTER TABLE public.post ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.post_id_seq
    START WITH 1
    INCREMENT BY 1
);

COPY public.author (id, email, display_name, external_id) FROM stdin;
1	ana@example.com	Ana; the author	1b4e28ba-2fa1-11d2-883f-0016d3cca427
2	it's-me@example.com	\N	6fa459ea-ee8a-3ca4-894e-db77e160355e
\.

ALTER TABLE ONLY public.author
    ADD CONSTRAINT author_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX author_email_key ON public.author USING btree (email);

CREATE INDEX post_author_idx ON public.post USING btree (author_id);

CREATE UNIQUE INDEX post_title_lower_idx ON public.post USING btree (lower((title)::text));

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_author_fk FOREIGN KEY (author_id) REFERENCES public.author(id) ON DELETE CASCADE;

CREATE TRIGGER post_touch BEFORE UPDATE ON public.post FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.post IS 'Entradas del blog';

COMMENT ON COLUMN public.post.title IS 'Título visible';

--
-- PostgreSQL database dump complete
--
