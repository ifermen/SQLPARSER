-- US-01 · Criterio 3: relaciones uno a uno (PostgreSQL)
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(50) NOT NULL
);

-- Uno a uno mediante FK con restricción UNIQUE
CREATE TABLE user_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users (id),
  theme VARCHAR(20) DEFAULT 'light'
);

-- Uno a uno mediante PK compartida (la FK es también la PK)
CREATE TABLE user_profile (
  user_id BIGINT PRIMARY KEY REFERENCES users,
  bio TEXT
);
