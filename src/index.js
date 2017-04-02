var Alexa = require('alexa-sdk');
var APP_ID = 'amzn1.ask.skill.22411318-ec8e-4add-a302-c89b0032ea43';

var GAME_STATES = {
    STARTMODE: '_STARTMODE', // User begins the game
    PLAYMODE: '_PLAYMODE', // Hands are live and user hits or stands,
    ENDMODE: '_ENDMODE' // Hand finishes and the user can restart or end
};
var deck, user, dealer;
var playReprompt = 'Say, hit, to get dealt another card, or, stay, to keep your hand.';
var endReprompt = 'Say yes to play again or no to end the game.';
var bet = 0;
var firstTime = 'Welcome! ';

exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    alexa.registerHandlers(newSessionHandlers, startStateHandlers, gameStateHandlers, endStateHandlers);
    alexa.dynamoDBTableName = 'Alexa-Blackjack';
    alexa.execute();
};

function Card(suit, rank, value) {
    this.suit = suit;
    this.rank = rank;
    this.value = value;
}

function Deck() {
    var card_rank = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
    var suits = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
    var deck = [];
    for (var i = 0; i < suits.length; i++) {
        for (var j = 0; j < card_rank.length; j++) {
            var value;
            if (j < 10) {
                value = j + 1;
            } else {
                value = 10;
            }
            var newcard = new Card(suits[i], card_rank[j], value);
            deck.push(newcard);
        }
    }
    this.shuffle = function() {
        var m = deck.length,
            t, i;

        // While there remain elements to shuffle…
        while (m) {

            // Pick a remaining element…
            i = Math.floor(Math.random() * m--);

            // And swap it with the current element.
            t = deck[m];
            deck[m] = deck[i];
            deck[i] = t;
        }

        return this.deck;
    };
    this.deal = function() {
        return deck.pop();
    };
}

function Hand() {
    this.hand = [];
    this.count = 0;
    this.softFlag = false;
    this.generateCount = function() {
        var aces = [];
        var count = 0;
        for (var i = 0; i < this.hand.length; i++) {
            if (this.hand[i].rank === 'Ace') {
                aces.push(11);
            } else {
                count += this.hand[i].value;
            }
        }
        for (var j = 0; j < aces.length; j++) {
            if (aces[j] + count > 21) {
                aces[j] = 1;
                count++;
            } else {
                this.softFlag = true;
                count += aces[j];
            }
        }
        return count;
    };
    this.soft = function() {
        if (this.softFlag) {
            return 'a soft ';
        } else {
            return '';
        }
    };
}

//  ------- helper functions ---------------------------------------------------

function newGame() {
    deck = new Deck();
    user = new Hand();
    dealer = new Hand();
    deck.shuffle();
    dealer.hand.push(deck.deal(), deck.deal());
    user.hand.push(deck.deal(), deck.deal());
    dealer.count = dealer.hand[0].value;
    user.count = user.hand[0].value + user.hand[1].value;
}

function initialResponse() {
    var dealerString = 'The dealer is showing ' + dealer.hand[0].rank + ' of ' + dealer.hand[0].suit + '. ';
    var userString = 'Your hand is ' + user.hand[0].rank + ' of ' + user.hand[0].suit + ', and ' + user.hand[1].rank + ' of ' + user.hand[1].suit;
    user.count = user.generateCount();
    if (user.count !== 21) {
        userString += ', totalling ' + user.soft() + user.count + '. ';
    }
    return dealerString + userString;
}

function hitEval() {
    var card = deck.deal();
    user.hand.push(card);
    user.count = user.generateCount();
    if (user.count > 21) {
        return [
            GAME_STATES.ENDMODE,
            'You were dealt a ' + card.rank + ' of ' + card.suit + ' totalling ' + user.count + '. You bust, and dealer wins. Would you like to play again?',
            endReprompt,
        ];
    } else {
        return [
            GAME_STATES.PLAYMODE,
            'You were dealt a ' + card.rank + ' of ' + card.suit + '. Your total is ' + user.soft() + user.count + ' against the dealers ' + dealer.count + '. What would you like to do?',
            playReprompt,
        ];
    }
}

function stayEval() {
    dealer.count = dealer.generateCount();
    var win = 'win';
    var dealerMessage = 'The dealer drew a ' + dealer.hand[1].rank + ' of ' + dealer.hand[1].suit + '. ';
    while (dealer.count < 17 || (dealer.count === 17 && dealer.softFlag)) { // while the dealer has a soft 17 or less
        var dcard = deck.deal();
        dealerMessage += 'and ' + dcard.rank + ' of ' + dcard.suit + ', ';
        dealer.hand.push(dcard);
        dealer.count = dealer.generateCount();
    }
    if (dealer.count > 21) { //dealer busts
        dealerMessage += '. Dealer busts with ' + dealer.count + '! You win! Would you like to play again?';
    } else if (dealer.count <= 21 && (dealer.count > 16 || (dealer.count === 17 && !dealer.softFlag))) {
        if (dealer.count > user.count) {
            win = 'lose';
            dealerMessage += '. Dealer has ' + dealer.count + '. Dealer wins! Would you like to play again?';
        } else if (dealer.count < user.count) {
            dealerMessage += '. Dealer has ' + dealer.count + '. You win! Would you like to play again?';
        } else {
            win = 'push';
            dealerMessage += '. You both have ' + dealer.count + '. You push! Would you like to play again?';
        }
    }
    return [dealerMessage, endReprompt, win];
}

function doubleEval() {
    var card = deck.deal();
    user.hand.push(card);
    user.count = user.generateCount();
    if (user.count > 21) {
        return [
            'Double Down! You were dealt a ' + card.rank + ' of ' + card.suit + ' totalling ' + user.count + '. You bust, and dealer wins. Would you like to play again?',
            endReprompt,
            'lose'
        ];
    } else {
        var dealerResult = stayEval();
        return [
            'Double Down! You were dealt a ' + card.rank + ' of ' + card.suit + ' totalling ' + user.count + '. ' + dealerResult[0],
            dealerResult[1],
            dealerResult[2]
        ];
    }
}

// --------------- handlers ----------------------------------------------------
var newSessionHandlers = {
    'NewSession': function() {
        if (this.attributes.earnings === undefined) {
            this.attributes.earnings = 500;
        } else if (this.attributes.earnings < 5) {
            this.attributes.earnings = 500;
            this.handler.state = GAME_STATES.STARTMODE;
            this.emit(':ask', firstTime + 'Because of your low funds the casino has generously given you a loan and you now currently have 500 dollars. Respond with a bet to get started!', 'Place a bet to begin!');
        }
        newGame();
        this.handler.state = GAME_STATES.STARTMODE;
        this.emit(':ask', firstTime + 'You currently have ' + this.attributes.earnings + ' dollars. Respond with a bet to get started!', 'Place a bet to begin!');
    },
    'SessionEndedRequest': function() {
        firstTime = 'Welcome! ';
        this.emit(':saveState', true);
    }
};

var startStateHandlers = Alexa.CreateStateHandler(GAME_STATES.STARTMODE, {
    'NewSession': function () {
        this.handler.state = '';
        this.emit('NewSession'); // Uses the handler in newSessionHandlers
    },
    'DealRequest': function() {
        bet = this.event.request.intent.slots.bet.value.toString();
        if (bet < 5) {
            this.emit(':ask','Your bet must be at least 5!', 'Please bet again');
        } else if (this.attributes.earnings - bet < 0) {
            this.emit(':ask', "You don't have that much money! Please try again.", 'Please bet again');
        } else {
            this.attributes.earnings -= parseInt(bet);
            user.count = user.generateCount();
            if (user.count === 21) {
                if (dealer.hand[0].value + dealer.hand[1].value === 21) {
                    this.handler.state = GAME_STATES.ENDMODE;
                    this.attributes.earnings += parseInt(bet);
                    this.emit(':saveState', true);
                    this.emit(':ask', 'You are betting ' + bet + ' dollars. Here we go! ' + initialResponse() + '. Blackjack! Checking if dealer has Blackjack<break time="2000ms"/>Too bad, it was a push. Dealer has ' + dealer.hand[1].rank + ' of ' + dealer.hand[1].suit + ' for 21. Would you like to play again?');
                } else {
                    this.handler.state = GAME_STATES.ENDMODE;
                    this.attributs.earnings += Math.ceil((parseInt(bet) / 2) * 3);
                    this.emit(':saveState', true);
                    this.emit(':ask', 'You are betting ' + bet + ' dollars. Here we go! ' + initialResponse() + '. Blackjack! Checking if dealer has Blackjack<break time="2000ms"/>Congratulations! You win! Would you like to play again?');
                }
            } else {
                this.handler.state = GAME_STATES.PLAYMODE;
                this.emit(':ask', 'You are betting ' + bet + ' dollars. Here we go! ' + initialResponse() + '. What would you like to do?', playReprompt);
            }
        }
    },
    'AMAZON.HelpIntent': function() {
        this.emit(':ask', 'Say, hit, to get dealt another card, or, stay, to keep your hand. You can also double down to double your bet and receive one more card. The goal is to get a higher total than the dealer without going over 21. If you win, you win double your bet, and if you push you keep your bet. Blackjack pays out 3 to 2. Currently you have ' + user.count + ' and the dealer has ' + dealer.count);
    },
    'AMAZON.StopIntent': function() {
        this.emit(':tell', "Goodbye!");
    },
    'AMAZON.CancelIntent': function() {
        this.emit(':tell', "Goodbye!");
    },
    'SessionEndedRequest': function() {
        this.handler.state = '';
        this.emit(':saveState', true);
    },
    'Unhandled': function() {
        this.emit(':ask', "I'm sorry. I didn't understand that. Place a bet to begin!");
    }
});

var gameStateHandlers = Alexa.CreateStateHandler(GAME_STATES.PLAYMODE, {
    'NewSession': function () {
        this.handler.state = '';
        this.emit('NewSession'); // Uses the handler in newSessionHandlers
    },
    'ActionIntent': function() {
        var action = this.event.request.intent.slots.action.value;
        var result;
        if (action === 'hit') {
            result = hitEval();
            this.handler.state = result[0];
            this.emit(':saveState', true);
            this.emit(':ask', result[1], result[2]);
        } else if (action === 'stand' || action === 'stay') {
            result = stayEval();
            if (result[2] === 'win') {
                this.attributes.earnings += parseInt(bet) * 2;
                this.emit(':saveState', true);
            } else if (result[2] === 'push') {
                this.attributes.earnings += parseInt(bet);
                this.emit(':saveState', true);
            }
            this.handler.state = GAME_STATES.ENDMODE;
            this.emit(':ask', result[0], result[1]);
        } else if (action === 'double down') {
            if (this.attributes.earnings - bet < 0) {
                this.emit(':ask', 'Sorry, you do not have enough to double down. Please respond with hit or stay.', 'Please respond with hit or stay.');
            } else {
                bet = parseInt(bet);
                this.attributes.earnings -= bet;
                bet *= 2;
                result = doubleEval();
                if (result[2] === 'win') {
                    this.attributes.earnings += (bet * 2);
                    this.emit(':saveState', true);
                } else if (result[2] === 'push') {
                    this.attributes.earnings += bet;
                    this.emit(':saveState', true);
                }
                this.handler.state = GAME_STATES.ENDMODE;
                this.emit(':ask', result[0], result[1]);
            }

        }
    },
    'AMAZON.HelpIntent': function() {
        this.emit(':ask', 'Say, hit, to get dealt another card, or, stay, to keep your hand. You can also double down to double your bet and receive one more card. The goal is to get a higher total than the dealer without going over 21. If you win, you win double your bet, and if you push you keep your bet. Blackjack pays out 3 to 2. Currently you have ' + user.count + ' and the dealer has ' + dealer.count);
    },
    'AMAZON.StopIntent': function() {
        this.emit(':tell', "Goodbye!");
    },
    'AMAZON.CancelIntent': function() {
        this.emit(':tell', "Goodbye!");
    },
    'SessionEndedRequest': function() {
        this.handler.state = '';
        this.emit(':saveState', true);
    },
    'Unhandled': function() {
        this.emit(':ask', "I'm sorry. I didn't quite catch that. Say, hit, to get dealt another card, or, stay, to keep your hand");
    }
});

var endStateHandlers = Alexa.CreateStateHandler(GAME_STATES.ENDMODE, {
    'NewSession': function () {
        this.handler.state = '';
        this.emit('NewSession'); // Uses the handler in newSessionHandlers
    },
    'PlayAgainIntent': function() {
        var answer = this.event.request.intent.slots.response.value;
        if (answer === 'yes') {
            firstTime = '';
            bet = 0;
            newGame();
            this.emit(':saveState', true);
            this.handler.state = '';
            this.emit('NewSession');
        } else {
            firstTime = 'Welcome! ';
            this.emit(':tell', 'Goodbye!');
        }
    },
    'AMAZON.StopIntent': function() {
        this.emit(':tell', "Goodbye!");
    },
    'AMAZON.CancelIntent': function() {
        this.emit(':tell', "Goodbye!");
    },
    'AMAZON.HelpIntent': function() {
        this.emit(':ask', 'If you would like to play again, say, yes. Otherwise say, no, and the game will end');
    },
    'SessionEndedRequest': function() {
        this.handler.state = '';
        this.emit(':saveState', true);
    },
    'Unhandled': function() {
        this.emit(':tell', 'Goodbye!');
    }
});

// -----------------------------------
