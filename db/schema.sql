-- ImmoKnauer production schema (PostgreSQL 16 + PostGIS).
-- Dev runs on the JSON store in src/lib/listings/store.ts; this is the target model.
-- Conventions: uuid PKs, timestamptz, every external datum links to data_source/data_snapshot.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Provenance ────────────────────────────────────────────────────────────
CREATE TABLE data_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,                 -- 'bundesbank-mfi', 'kfw-catalogue', 'partner:xyz'
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('official_statistic','official_law','official_program','commercial_benchmark','partner_feed','user_input','assumption','calculation')),
  url text,
  licence text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE data_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES data_source(id),
  observed_at timestamptz,                  -- when the source published the value
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  methodology text,
  confidence text CHECK (confidence IN ('high','medium','low')),
  payload jsonb NOT NULL,
  checksum text
);

-- ── Users & profiles ──────────────────────────────────────────────────────
CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE user_profile (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  display_name text,
  household jsonb,                          -- adults, children, incomes, obligations (encrypted at rest)
  locale text NOT NULL DEFAULT 'de-DE',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE search_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name text NOT NULL,
  transaction text NOT NULL CHECK (transaction IN ('buy','rent')),
  purpose text NOT NULL CHECK (purpose IN ('owner_occupied','investment')),
  max_price numeric, max_monthly numeric, equity numeric,
  min_rooms numeric, min_area numeric,
  area geometry(MultiPolygon, 4326),
  must_have text[] NOT NULL DEFAULT '{}', nice_to_have text[] NOT NULL DEFAULT '{}',
  max_commute_min int, min_gross_yield numeric,
  score_weights jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commute_destination (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  label text NOT NULL,                      -- work, school, gym, family
  location geography(Point, 4326) NOT NULL,
  modes text[] NOT NULL DEFAULT '{transit}'
);
CREATE TABLE saved_search (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  search_profile_id uuid REFERENCES search_profile(id) ON DELETE SET NULL,
  query jsonb NOT NULL,
  alert_channels text[] NOT NULL DEFAULT '{in_app}',   -- email, push, in_app
  alert_on text[] NOT NULL DEFAULT '{new_listing,price_drop}',
  last_run_at timestamptz
);

-- ── Sellers, agencies, sources ────────────────────────────────────────────
CREATE TABLE agency (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, website text, imprint jsonb, verified boolean NOT NULL DEFAULT false);
CREATE TABLE seller (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid REFERENCES agency(id), name text, email text, phone text, is_private boolean NOT NULL DEFAULT false);
CREATE TABLE listing_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('partner_feed','agent_upload','csv_import','xml_feed','manual','api')),
  name text NOT NULL,
  licence text NOT NULL,                    -- legal basis for using the data
  data_source_id uuid REFERENCES data_source(id)
);

-- ── Physical property ─────────────────────────────────────────────────────
CREATE TABLE address (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  street text, house_number text, postcode text, city text NOT NULL,
  state_code text CHECK (state_code ~ '^DE-[A-Z]{2}$'),
  municipality_key text,                    -- AGS
  precision text NOT NULL CHECK (precision IN ('exact','street','postcode','city'))
);
CREATE TABLE geo_location (
  address_id uuid PRIMARY KEY REFERENCES address(id) ON DELETE CASCADE,
  point geography(Point, 4326) NOT NULL,
  geocoder text NOT NULL, geocoded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX geo_location_gix ON geo_location USING gist (point);
CREATE TABLE building (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id uuid REFERENCES address(id),
  year_built int, units int, heating text, heating_year int
);
CREATE TABLE property (                     -- canonical PropertyEntity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid REFERENCES building(id),
  canonical_listing_id uuid,                -- FK added below
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES property(id) ON DELETE CASCADE,
  floor int, living_area numeric, rooms numeric, bedrooms int, bathrooms int
);
CREATE TABLE energy_certificate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES property(id) ON DELETE CASCADE,
  certificate_type text CHECK (certificate_type IN ('consumption','demand')),
  energy_class text, kwh_per_sqm_year numeric, co2_kg_per_sqm_year numeric,
  heating_source text, valid_until date, document_id uuid
);

-- ── Listings ──────────────────────────────────────────────────────────────
CREATE TABLE listing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_source_id uuid NOT NULL REFERENCES listing_source(id),
  external_id text,
  property_id uuid REFERENCES property(id),
  seller_id uuid REFERENCES seller(id),
  address_id uuid REFERENCES address(id),
  transaction text NOT NULL CHECK (transaction IN ('buy','rent')),
  type text NOT NULL,
  title text NOT NULL, description text,
  price numeric, cold_rent numeric, warm_rent numeric, utilities numeric, heating_costs numeric, deposit numeric, hausgeld numeric,
  living_area numeric, plot_area numeric, rooms numeric, condition text, new_build boolean,
  commission jsonb, available_from date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','removed')),
  first_seen_at timestamptz NOT NULL, last_updated_at timestamptz NOT NULL, last_verified_at timestamptz,
  raw jsonb,                                -- original record for audit/reprocessing
  UNIQUE (listing_source_id, external_id)
);
ALTER TABLE property ADD CONSTRAINT property_canonical_fk FOREIGN KEY (canonical_listing_id) REFERENCES listing(id);
CREATE INDEX listing_search_idx ON listing (transaction, status, price, warm_rent, rooms);
CREATE TABLE property_feature (listing_id uuid REFERENCES listing(id) ON DELETE CASCADE, feature text NOT NULL, PRIMARY KEY (listing_id, feature));
CREATE TABLE property_image (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES listing(id) ON DELETE CASCADE, url text NOT NULL, caption text, position int, perceptual_hash text);
CREATE TABLE floorplan (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES listing(id) ON DELETE CASCADE, url text NOT NULL, perceptual_hash text);
CREATE TABLE property_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES property(id), listing_id uuid REFERENCES listing(id), uploaded_by uuid REFERENCES app_user(id),
  kind text NOT NULL,                       -- energy_certificate, expose, wirtschaftsplan, protokoll, ...
  storage_key text NOT NULL, extracted jsonb, extraction_model text, extracted_at timestamptz
);
CREATE TABLE price_history (listing_id uuid REFERENCES listing(id) ON DELETE CASCADE, at timestamptz NOT NULL, price numeric NOT NULL, PRIMARY KEY (listing_id, at));
CREATE TABLE listing_event (id bigserial PRIMARY KEY, listing_id uuid NOT NULL REFERENCES listing(id) ON DELETE CASCADE, at timestamptz NOT NULL DEFAULT now(), kind text NOT NULL, details jsonb);
CREATE TABLE listing_quality_score (listing_id uuid PRIMARY KEY REFERENCES listing(id) ON DELETE CASCADE, score int NOT NULL, missing text[] NOT NULL, inconsistencies text[] NOT NULL, computed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE dedup_match (listing_a uuid REFERENCES listing(id), listing_b uuid REFERENCES listing(id), score numeric NOT NULL, signals jsonb NOT NULL, decided text CHECK (decided IN ('auto','confirmed','rejected')), PRIMARY KEY (listing_a, listing_b));

-- ── User ↔ property ───────────────────────────────────────────────────────
CREATE TABLE saved_property (
  user_id uuid REFERENCES app_user(id) ON DELETE CASCADE, property_id uuid REFERENCES property(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','hidden','viewed','contacted','visit_requested')),
  notes text, tags text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);
CREATE TABLE interaction_signal (          -- recommendation signals (save, view, share, contact, hide, not_interested)
  id bigserial PRIMARY KEY, user_id uuid REFERENCES app_user(id) ON DELETE CASCADE, property_id uuid REFERENCES property(id) ON DELETE CASCADE,
  kind text NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE property_score (
  property_id uuid REFERENCES property(id) ON DELETE CASCADE, search_profile_id uuid REFERENCES search_profile(id) ON DELETE CASCADE,
  overall int, components jsonb NOT NULL, weights jsonb NOT NULL, computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, search_profile_id)
);
CREATE TABLE notification (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, channel text NOT NULL, kind text NOT NULL, payload jsonb NOT NULL, sent_at timestamptz, read_at timestamptz);

-- ── Finance ───────────────────────────────────────────────────────────────
CREATE TABLE loan_rate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_snapshot_id uuid NOT NULL REFERENCES data_snapshot(id),
  fixed_years_min int NOT NULL, fixed_years_max int, ltv_max numeric, rate_type text NOT NULL CHECK (rate_type IN ('effective','nominal')),
  annual_rate numeric NOT NULL, personalised boolean NOT NULL DEFAULT false
);
CREATE TABLE financial_calculation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES app_user(id) ON DELETE CASCADE, property_id uuid REFERENCES property(id),
  kind text NOT NULL,                       -- affordability, purchase_costs, rent_vs_buy, investor
  inputs jsonb NOT NULL, outputs jsonb NOT NULL, engine_version text NOT NULL, rule_versions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mortgage_scenario (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), financial_calculation_id uuid NOT NULL REFERENCES financial_calculation(id) ON DELETE CASCADE, label text NOT NULL, inputs jsonb NOT NULL, outputs jsonb NOT NULL);
CREATE TABLE government_program (
  id text PRIMARY KEY, provider text NOT NULL, code text NOT NULL, name text NOT NULL, details jsonb NOT NULL,
  source_url text NOT NULL, last_verified_at date NOT NULL, verification_status text NOT NULL, valid_from date, valid_to date
);

-- ── Regulation (versioned) ────────────────────────────────────────────────
CREATE TABLE regulation (
  id text NOT NULL, version int NOT NULL,
  topic text NOT NULL,                      -- transfer_tax, broker, rent_cap, energy_certificate, ...
  jurisdiction text NOT NULL, effective_from date NOT NULL, effective_to date,
  value jsonb NOT NULL, source_name text NOT NULL, source_url text NOT NULL,
  last_verified_at date NOT NULL, verification_status text NOT NULL CHECK (verification_status IN ('verified_official','secondary_source','unverified')),
  notes text, PRIMARY KEY (id, version)
);
CREATE VIEW tax_rule AS SELECT * FROM regulation WHERE topic = 'transfer_tax';

-- ── Area intelligence ─────────────────────────────────────────────────────
CREATE TABLE neighborhood (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, municipality_key text, boundary geometry(MultiPolygon, 4326));
CREATE INDEX neighborhood_gix ON neighborhood USING gist (boundary);
CREATE TABLE neighborhood_statistic (neighborhood_id uuid REFERENCES neighborhood(id) ON DELETE CASCADE, metric text NOT NULL, value numeric, unit text, data_snapshot_id uuid NOT NULL REFERENCES data_snapshot(id), PRIMARY KEY (neighborhood_id, metric, data_snapshot_id));
CREATE TABLE market_statistic (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), area_key text NOT NULL, transaction text NOT NULL, property_type text NOT NULL, median_ppsqm numeric, p25 numeric, p75 numeric, sample_size int, period daterange NOT NULL, data_snapshot_id uuid NOT NULL REFERENCES data_snapshot(id));
CREATE TABLE transit_point (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, kind text, point geography(Point, 4326) NOT NULL, data_source_id uuid REFERENCES data_source(id));
CREATE TABLE amenity (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, name text, point geography(Point, 4326) NOT NULL, data_source_id uuid REFERENCES data_source(id));
CREATE INDEX amenity_gix ON amenity USING gist (point);

-- ── AI ────────────────────────────────────────────────────────────────────
CREATE TABLE conversation (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES app_user(id) ON DELETE CASCADE, property_id uuid REFERENCES property(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ai_message (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE, role text NOT NULL, content jsonb NOT NULL, grounding jsonb, model text, created_at timestamptz NOT NULL DEFAULT now());

-- ── Audit ─────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (id bigserial PRIMARY KEY, actor uuid, action text NOT NULL, entity text NOT NULL, entity_id text, before jsonb, after jsonb, at timestamptz NOT NULL DEFAULT now());
