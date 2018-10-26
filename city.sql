DROP TABLE IF EXISTS weathers CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS yelps CASCADE;

CREATE TABLE locations(
    id SERIAL PRIMARY KEY,
    search_query VARCHAR(255),
    formatted_query VARCHAR(255),
    latitude NUMERIC(8,6),
    longitude NUMERIC(9,6)
);


CREATE TABLE weathers (
    id SERIAL PRIMARY KEY,
    forecast VARCHAR(255),
    time VARCHAR(255),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    created_at VARCHAR(255)
);

CREATE TABLE yelps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    image_url VARCHAR(255),
    price VARCHAR(255),
    rating VARCHAR(255),
    url VARCHAR(255),
    location_id INTEGER NOT NULL REFERENCES locations(id)
);

CREATE TABLE meetups (
    id SERIAL PRIMARY KEY,
    link VARCHAR(255),
    name VARCHAR(255),
    creation_date VARCHAR(255),
    host VARCHAR(255),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    created_at VARCHAR(255)
);