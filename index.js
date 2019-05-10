const   express = require('express'),
        app = express(),
        axios = require('axios'),
        parseString = require('xml2js').parseString;


// DB
const knex = require('knex')({
    client: 'postgres',
    connection: {
        host     : '127.0.0.1',
        user     : 'postgres',
        password : 'postgres',
        database : 'boardgamegen',
        charset  : 'utf8'
    }
});
// then connect bookshelf with knex
const bookshelf = require('bookshelf')(knex);


// headers to fix CORS issues
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

/* ==================== */
/* MODELS               */
/* ==================== */

// Games model
const Game = bookshelf.Model.extend({
    tableName: 'games'
});

// Users model
const User = bookshelf.Model.extend({
    tableName: 'users'
});


// TODOS:
// Build a function that takes in a range of IDs
    // Use process.argv arguments
// First check each ID against the current Database
// If it exists, do nothing
// If it doesn't exist hit the BGG API and grab the XML
    // Make sure to spread out the requests to API (setTimeout?)
// Extract the needed data and save to my DB
// Count every time a game was added to DB
    // Console log how many items were added to DB


// Counter
let counter = 0;

// The low end of the range we will be searching
const minRange = process.argv[2];
// The high end of the range we will be searching
const maxRange = process.argv[3];
//console.log('Search from', minRange, 'to', maxRange);

// The array to hold any ID's not found in local DB
const toScrape = [];


function checkCurrentDB(min, max, callback) {

    // loop through the IDs provided in the process arguments
    for (let i = min; i <= max; i++) {

        new Game({ 'game_id': `${i}` })
            .fetch()
            .then(result => {

                // If can't find in local DB push to our toScrape array
                if (result === null) {
                    toScrape.push(Number(i));
                }

                // Otherwise do nothing

            })
            .then(results => {

                // If i === max it's the last ID we are looking through
                // so we can stop the process here
                if (i == max) {

                    // print out which games are to be scraped
                    console.log('About to scrape', toScrape.length, 'games. List:', toScrape);

                    // hit the callback
                    return callback();
                }

            })
            .catch(error => {
                console.log('Checking local DB error:', error);
            })

    } // end for loop

}


function getData(id, callback) {

    // Hit the BGG API (with stats turned on)
    axios.get('https://www.boardgamegeek.com/xmlapi2/thing?id=' + id + '&stats=1')
    
         .then(result => {

            // Initialize parser
            // let parser = new DOMParser();
            // Save data/xml from BGG into a variable
            let xml = result.data;

            // new Game object
            let gameToSave = {};

            parseString(xml, function(err, result) {

                if (err) {
                    throw err;
                }

                // First make sure something exists at this ID
                if (result.items.item === undefined) {
                    console.log("Nothing at this ID.")
                    return callback(0);
                }

                // Otherwise save the main game object into a variable
                let gameObject = result.items.item[0];

                // Then make sure item we are parsing is a BoardGame
                if (gameObject.$.type !== "boardgame") {
                    console.log("This is not a boardgame.");
                    return callback(0);
                }

                // console.log(JSON.stringify(result));
                // console.log(gameObject.statistics[0].ratings[0].average[0].$.value);

                // Game
                gameToSave = {
                    rank: Number(gameObject.statistics[0].ratings[0].ranks[0].rank[0].$.value) || 0,
                    bgg_link: 'https://www.boardgamegeek.com/boardgame/' + id + '/',
                    game_id: id,
                    names: gameObject.name[0].$.value,
                    image_url: gameObject.image[0],
                    min_players: Number(gameObject.minplayers[0].$.value) || 1,
                    max_players: Number(gameObject.maxplayers[0].$.value) || 1,
                    min_time: Number(gameObject.minplaytime[0].$.value) || 1,
                    max_time: Number(gameObject.maxplaytime[0].$.value) || 1,
                    avg_time: Number(gameObject.playingtime[0].$.value) || 1,
                    year: Number(gameObject.yearpublished[0].$.value),
                    age: 0,
                    mechanic: '',
                    category: '',
                    avg_rating: Number(gameObject.statistics[0].ratings[0].average[0].$.value) || 0,
                    geek_rating: Number(gameObject.statistics[0].ratings[0].bayesaverage[0].$.value) || 0,
                    num_votes: Number(gameObject.statistics[0].ratings[0].usersrated[0].$.value) || 0,
                }


                // Game age
                // Check if year published is greater than 0
                // If it is calculate the age, if not set age to 0
                gameToSave.age = gameObject.yearpublished[0].$.value > 0 ? (new Date().getFullYear() - gameObject.yearpublished[0].$.value) : 0;

                // Mechanics and categories
                let mechanicsAndCategories = gameObject.link;

                // Loop through the categories and mechanics
                for (let i = 0; i < mechanicsAndCategories.length; i++) {
                    
                    // If it's a category
                    // Save to category string in game object
                    if (mechanicsAndCategories[i].$.type === "boardgamecategory") {
                        gameToSave.category += mechanicsAndCategories[i].$.value + ', ';

                    // If it's a mechanic
                    // Save to mechanic string in game object
                    } else if (mechanicsAndCategories[i].$.type === "boardgamemechanic") {
                        gameToSave.mechanic += mechanicsAndCategories[i].$.value + ', ';
                    }

                }

            }) // end parseString()
            
            // See what our object looks like
            // console.log(gameToSave);
            return callback(gameToSave);

         })

         .catch(error => {
             console.log(error);
         })

}

function saveData(game) {

    let newGame = new Game ({
        rank: game.rank,
        bgg_link: game.bgg_link,
        game_id: game.game_id,
        names: game.names,
        image_url: game.image_url,
        min_players: game.min_players,
        max_players: game.max_players,
        min_time: game.min_time,
        max_time: game.max_time,
        avg_time: game.avg_time,
        year: game.year,
        age: game.age,
        mechanic: game.mechanic,
        category: game.category,
        avg_rating: game.avg_rating,
        geek_rating: game.geek_rating,
        num_votes: game.num_votes,
    });

    // Save the game to the DB
    newGame.save(null, {method: 'insert'})
        
        .then(savedGame => {

            // step counter up
            counter += 1;

            // print out what we saved to DB
            // console.log('Saved to DB:', savedGame);

        })
        
        .catch(error => {
            console.log('Error saving to DB', error);
        });

} 

// First, check if we already have an of these IDs in the DB already
checkCurrentDB(minRange, maxRange, () => {

    // After we've looped through all the IDs and found pushed only IDs that are not in the local DB
    // loop through each ID we don't have and scrape from BGG, then save to DB
    toScrape.forEach((id) => {

        getData(id, (gameToSave) => {

            if (gameToSave.names === undefined) {
                return;
            } else {
                console.log("Gonna save", gameToSave.names, 'to DB. It is for a max of', gameToSave.max_players, 'players');
                saveData(gameToSave);
            }
        });

    });

    // while(counter > toScrape.length) {}
    
});

// Print out how many games we saved
console.log('Total games saved:', counter);

// exit the process
// process.exit();


// let newGame = new Game ({ 
    // rank: 198274,
    // bgg_link: 'https://www.boardgamegeek.com/boardgame/10000000/',
    // game_id: 989898,
    // names: 'Test game 3',
    // min_players: 1,
    // max_players: 99,
    // avg_time: 50,
    // min_time: 1,
    // max_time: 99,
    // year: 2019,
    // avg_rating: 7.21,
    // geek_rating: 9.8,
    // num_votes: 29087,
    // image_url: '',
    // age: 0,
    // mechanic: 'Foo',
    // category: 'Bar',
//  });