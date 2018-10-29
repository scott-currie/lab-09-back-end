'use strict';

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

require('dotenv').config();

const PORT = process.env.PORT;

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err => console.log(err));

const app = express();

app.use(cors());

app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/meetups', getMeetups);
app.get('/yelp', getYelp);

function handleError(err, res) {
  console.error('ERR', err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

app.listen(PORT, () => console.log(`App is up on ${PORT}`) );

// -------------------------- LOCATION ----------------- //

function Location(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}
Location.prototype.save = function() {
  let SQL = `
    INSERT INTO locations
      (search_query,formatted_query,latitude,longitude)
      VALUES($1,$2,$3,$4)
  `;
  let values = Object.values(this);
  client.query(SQL,values);
};

Location.fetchLocation = (query) => {
  const _URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(_URL)
    .then( data => {
      console.log('Got location data from API');
      if ( ! data.body.results.length ) { throw 'No Data'; }
      else {
        let location = new Location(query, data.body.results[0]);
        location.save();
        return location;
      }
    })
    ;
};

function getLocation(request,response) {

  const locationHandler = {

    query: request.query.data,

    cacheHit: (results) => {
      console.log('Got location data from SQL');
      response.send(results.rows[0]);
    },

    cacheMiss: () => {
      Location.fetchLocation(request.query.data)
        .then(data => response.send(data));
    },
  };

  Location.lookupLocation(locationHandler);

}

Location.lookupLocation = (handler) => {

  const SQL = `SELECT * FROM locations WHERE search_query=$1`;
  const values = [handler.query];

  return client.query( SQL, values )
    .then( results => {
      if( results.rowCount > 0 ) {
        handler.cacheHit(results);
      }
      else {
        handler.cacheMiss();
      }
    })
    .catch( console.error );

};

// -------------------------- WEATHERS ----------------- //

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

Weather.prototype.save = function(id) {
  const SQL = `INSERT INTO weathers (forecast, time, location_id, created_at) VALUES ($1, $2, $3, $4);`;
  const values = Object.values(this);
  values.push(id);
  values.push(Date.now());
  client.query(SQL, values);
};

Weather.deleteEntryById = function (id) {
  const SQL = `DELETE FROM weathers WHERE location_id=${id};`;
  client.query(SQL)
    .then(() => {
      console.log('DELETED entry from SQL');
    })
    .catch(error => handleError(error));
}

Weather.lookup = function(handler) {
  const SQL = `SELECT * FROM weathers WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      if(result.rowCount > 0) {
        console.log('Weather ata existed in SQL');

        let currentAge = Date.now() - result.rows[0].created_at / (1000 * 60);

        if (result.rowCount > 0 && currentAge > 1) {
          console.log('Weather DATA was too old')
          Weather.deleteEntryById(handler.location.id)
          handler.cacheMiss();
        } else {
          console.log('Weather DATA was just right')
          handler.cacheHit(result);
        }

      } else {
        console.log('Got weather data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};

Weather.fetch = function(location) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${location.latitude},${location.longitude}`;

  return superagent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        const summary = new Weather(day);
        summary.save(location.id);
        return summary;
      });
      return weatherSummaries;
    })
    .catch(error => handleError(error));
};

function getWeather(request, response) {

  const handler = {

    location: request.query.data,

    cacheHit: function(result) {
      response.send(result.rows);
    },

    cacheMiss: function() {
      Weather.fetch(request.query.data)
        .then( results => response.send(results) )
        .catch( console.error );
    },
  };

  Weather.lookup(handler);

}

// -------------------------- MEETUPS ----------------- //

function Meetup(meetup) {
  // console.log(meetup);
  this.link = meetup.link;
  this.name = meetup.name;
  this.creation_date = new Date(meetup.created).toString().slice(0, 15);
  this.host = meetup.group.name;
}

Meetup.prototype.save = function(id) {
  const SQL = `INSERT INTO meetups (link, name, creation_date, host, location_id, created_at) VALUES ($1, $2, $3, $4, $5, $6);`;
  const values = Object.values(this);
  values.push(id);
  values.push(Date.now());
  client.query(SQL, values);
};

Meetup.deleteEntryById = function (id) {
  const SQL = `DELETE FROM meetups WHERE location_id=${id};`;
  client.query(SQL)
    .then(() => {
      console.log('DELETED meetup entry from SQL');
    })
    .catch(error => handleError(error));
}

Meetup.lookup = function(handler) {
  console.log('Lets find meetups.');
  const SQL = `SELECT * FROM meetups WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      if(result.rowCount > 0) {
        console.log('Meetup data existed in SQL');

        let currentAge = Date.now() - result.rows[0].created_at / (1000 * 60);

        if (result.rowCount > 0 && currentAge > 1) {
          console.log('Meetup data was too old')
          Meetup.deleteEntryById(handler.location.id)
          handler.cacheMiss();
        } else {
          console.log('Meetup data was just right')
          handler.cacheHit(result);
        }

      } else {
        console.log('No meetup data returned from db.');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};

Meetup.fetch = function(location) {
  console.log('Going to fetch meetup info');
  // TODO: devise a meetup query string
  const url = `https://api.meetup.com/find/events?key=${process.env.MEETUP_API_KEY}&zip=02112`;

  return superagent.get(url)
    .then(result => {
      // console.log('**MEETUP RESULT**', result.body);
      let meetupData = [];
      let numResults = (result.body.length > 5) ? 5: result.body.length;
      for (let i = 0;i < numResults; i++) {
        meetupData.push(new Meetup(result.body[i]));
      }
      return meetupData;
    })
    .catch(console.log('Fucked up the meetup fetch'));
};

function getMeetups(request, response) {

  const handler = {

    location: request.query.data,

    cacheHit: function(result) {
      response.send(result.rows);
    },

    cacheMiss: function() {
      Meetup.fetch(request.query.data)
        .then( results => response.send(results) )
        .catch( console.error );
    },
  };

  Meetup.lookup(handler);

}

/////////////////// YELP ////////////////////////

function Yelp(business) {
  this.name = business.name;
  this.image_url = business.image_url;
  this.price = business.price;
  this.rating = business.rating;
  this.url = business.url;
}

Yelp.prototype.save = function(id) {
  const SQL = `INSERT INTO yelps (name, image_url, price, rating, url, location_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
  const values = Object.values(this);
  values.push(id);
  values.push(Date.now());
  client.query(SQL, values);
};

Yelp.deleteEntryById = function (id) {
  const SQL = `DELETE FROM yelps WHERE location_id=${id};`;
  client.query(SQL)
    .then(() => {
      console.log('DELETED entry from SQL');
    })
    .catch(error => handleError(error));
}

Yelp.lookup = function(handler) {
  const SQL = `SELECT * FROM yelps WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      if(result.rowCount > 0) {
        console.log('Data existed in SQL');

        let currentAge = Date.now() - result.rows[0].created_at / (1000 * 60);

        if (result.rowCount > 0 && currentAge > 1) {
          console.log('DATA was too old')
          Yelp.deleteEntryById(handler.location.id)
          handler.cacheMiss();
        } else {
          console.log('DATA was just right')
          handler.cacheHit(result);
        }

      } else {
        console.log('Got data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};

Yelp.fetch = function(location) {
  const _URL = `https://api.yelp.com/v3/businesses/search?latitude=${location.latitude}&longitude=${location.longitude}`;

  return superagent.get(_URL)
    .set({'Authorization': `Bearer ${process.env.YELP_API_KEY}`})
    .then(result => {
      const businesses = [];
      result.body.businesses.forEach(biz => {
        let business = new Yelp(biz);
        businesses.push(business);
        business.save(location.id);

      })
      // response.send(businesses);
      return businesses;
    });
};

function getYelp(request, response) {

  const handler = {

    location: request.query.data,

    cacheHit: function(result) {
      response.send(result.rows);
    },

    cacheMiss: function() {
      Yelp.fetch(request.query.data)
        .then( results => response.send(results) )
        .catch( console.error );
    },
  };

  Yelp.lookup(handler);

}