 /*
  * Copyright 2018 Amazon.com, Inc. and its affiliates. All Rights Reserved.
  *
  * Licensed under the MIT License. See the LICENSE accompanying this file
  * for the specific language governing permissions and limitations under
  * the License.
  */
const AmazonSpeech = require("ssml-builder/amazon_speech");
const AWS = require("aws-sdk");
const alexa = require("alexa-app");
const express = require("express");
const sf = require("./salesforce");

const app = express();
const debug = process.env.DEBUG_ENABLED || true;
const PORT = process.env.PORT || 8080;
const schemaName = process.env.SCHEMA_NAME || "salesforce";

// Defines Alexa endpoint of /skill and set up express
const alexaApp = new alexa.app("skill");

alexaApp.express({
  expressApp: app,
  checkCert: false,
  debug: true
});

// from here on you can setup any other express routes or middlewares as normal
app.set("view engine", "ejs");

alexaApp.launch(function(request, response) {
  let output = new AmazonSpeech();
  //output.say("You did it!").sayAs({word: "ruh roh", interpret: "interjection"});
  output.say(`Welcome to Your Sales Assistant, powered by Salesforce. Try asking about your revenue or ask me about an opportunity.`);

  response.say(output.ssml(true)).shouldEndSession(false);
});

alexaApp.intent("GetOpportunity", {
    "dialog": {
      type: "delegate",
    },
    "slots": {},
    "utterances": []
  },
  function(request, response) {

    let session = request.getSession();
    let dialog = request.getDialog();

    debugLog(`DEBUG - Entering GetOpportunity`);

    const sessionOppId = session.get("opportunityId");
    if (sessionOppId) {
      debugLog(`DEBUG - Found an existing opportunity in session.`);
      response.say(`You have an opportunity in session: ${session.get("opportunityName")}`);
      session.clear();
      response.send();
    } else if (!getSlotValue(request.slots["keywords"])) {
      // If there are no input keywords, delegate back to Alexa
      let output = `First, we need to find an opportunity. Please say some keywords to look up your opportunity.`;
      response.say(output).reprompt(output)
        .directive(buildGetOpportunityElicitSlotDirective()).shouldEndSession(false);
    } else {
      debugLog("DEBUG - no opportunity in session.");

      // Split keywords apart and do an AND on all keywords
      let keywordsInput = getSlotValue(request.slots["keywords"]);
      let keywords = keywordsInput.split(" ");

      // Combine with previous keywords if present
      let previousKeywords = session.get("keywords");
      if (previousKeywords) {
        keywords = keywords.concat(previousKeywords.split(" "));
      } else {
        previousKeywords = "";
      }

      let keywordWhereClause = "";
      for (let i = 0; i < keywords.length; i++) {
          keywordWhereClause += `name ~* '${keywords[i]}' AND `;
      }
      
      let query = `select opp.name, opp.sfid, opp.amount, opp.closedate, opp.stagename, opp.nextstep
                  from ${schemaName}.Opportunity as opp 
                  where ${keywordWhereClause}
                  isClosed = false`;

      return sf.queryData(query).then(function(results) {
        debugLog(`DEBUG - Query results - ${JSON.stringify(results)}`);

        // Store other IDs in session, then ask user to pick first or second
        if (results.length > 1) {
          // Store the previous keywords + new keywords, then solicit for keywords again
          let combinedKeywords = (keywordsInput + " ") + previousKeywords;
          debugLog(`DEBUG - Combined keywords : ${combinedKeywords}`);
          session.set("keywords", combinedKeywords);

          let opportunityNames = "";
          for (let i = 0; i < results.length; i++) {
            opportunityNames += `${results[i].name}, `;
          }
          opportunityNames = opportunityNames.substring(0, opportunityNames.length - 2);

          // Provide a list of the opportunity names in a card to help with selection
          response.card(buildStandardCard("Select an Opportunity", opportunityNames.replace(/,\s/g, '\n')));

          let reprompt = `Can you give me another term to narrow it down further?`;
          let output = reprompt + `I have ${results.length} results so far: ` + opportunityNames;

          response.say(output).reprompt(reprompt)
            .directive(buildGetOpportunityElicitSlotDirective()).shouldEndSession(false);
        } else {
          try {
            // Store the opportunity we found into the session
            session.set("opportunityId", results[0].sfid);
            session.set("opportunityName", results[0].name);

            buildOpportunityResponse(request, response, results[0]);
          } catch (err) {
            console.log(`ERROR: error in retrieving opportunity: ${err}`);
            let output = `I wasn't able to find an opportunity with that name. Please try again later.`;
            response.say(output).send();
          }
        }
      });
    }
  }
);


alexaApp.intent("RevenueReport", {
    "slots": {},
    "utterances": []
  },
  function(request, response) {
    console.log(`INFO - RevenueReport start`);
    let session = request.getSession();
    let userId = session.get("userId");

    // Commenting out isClosed for the purpose of demo
    const isClosed = false;
    // For purpose of demo, leaving this as 0
    const probabilityFloor = 0;
    const timePeriod = "Quarter";

    query = `select SUM(opp.amount) as totalrevenue, COUNT(*) as totalopps
                from ${schemaName}.Opportunity as opp 
                LEFT JOIN ${schemaName}.Period as p 
                ON opp.closedate >= p.startdate AND opp.closedate <= p.enddate
                where opp.ownerid = '${userId}' 
                AND p.startdate <= CURRENT_DATE
                AND p.enddate >= CURRENT_DATE
                AND p.type = '${timePeriod}'
                AND probability >= ${probabilityFloor}`;
                //AND isclosed = ${isClosed}`;
    debugLog(`DEBUG - revenue query:\n${query}`);

    return sf.queryData(query).then(function(results) {
      debugLog(`DEBUG - output of revenue query: ${JSON.stringify(results)}`);
      let roundedRevenue = Math.round(parseInt(results[0].totalrevenue)/1000)*1000;
      let output = new AmazonSpeech();

      if (isNaN(roundedRevenue)) {
        output.say(`You don't have any projected revenue this quarter. `)
              .say(`Check your Salesforce opportunities to make sure you have some that are set to close this quarter. `);
      } else {
        output.say(`Your projected revenue for this fiscal quarter is`)
              .sayAs({word: "$" + roundedRevenue, interpret: "unit"})
              .say(` across ${results[0].totalopps} opportunities. `);
      }
      output.say(`I can help you look up an opportunity by name, just ask.`);

      response.say(output.ssml()).shouldEndSession(false).send();
    });

  }
);

alexaApp.intent("UpdateOpportunity", {
    "slots": {},
    "utterances": []
  },
  function(request, response) {
    console.log(`INFO - Entering UpdateOpportunity`);

    // First, check to see that we have an opportunity we're working with
    const sessionOppId = request.getSession().get("opportunityId");
    if (sessionOppId) {

      debugLog(`DEBUG - Opportunity ID is in session`);

      let amount = getSlotValue(request.slots["amount"]);
      let closingDate = getSlotValue(request.slots["closingDate"]);
      let stage = getSlotValue(request.slots["stage"]);
      let updateOption = getSlotValue(request.slots["updateOption"]);
      let nextSteps = getSlotValue(request.slots["nextSteps"]);

      if (!amount && !closingDate && !stage && !updateOption && !nextSteps) {
        debugLog(`DEBUG - No slots`);
        // If no slots provided, give return prompt about what is possible
        let output = `What would you like to update: the opportunity size, closing date, stage, or next steps?`;
        response.say(output).shouldEndSession(false);
      } else if (updateOption && !amount && !closingDate && !stage && !nextSteps) {
        debugLog(`DEBUG - updateOption provided: ${updateOption}`);

        // If updateOption slot provided, give custom prompts based on the type
        const selectedOption = updateOption;
        let output = "";

        switch (selectedOption) {
          case "amount":
            output = `What's the new opportunity size?`;
            break;
          case "closingDate":
            output = `What's the new date?`;
            break;
          case "stage":
            output = `What's the new stage?`;
            break;
          case "nextSteps":
            output = `What are the next steps?`;
            break;
        }

        // Make sure Alexa knows we are filling a specific slot
        let elicitSlotDirective = buildUpdateOpportunityElicitSlotDirective(selectedOption);

        debugLog(`DEBUG - elicitSlotDirective: ${JSON.stringify(elicitSlotDirective)}`);

        response.say(output).reprompt(output).directive(elicitSlotDirective).shouldEndSession(false);
      } else {
        // If one slot is provided, we're good to go.
        let query = "";
        let output = new AmazonSpeech();
        if (amount) {
          debugLog(`DEBUG - Amount update for UpdateOpportunity of ${amount})`);
          output.say(`I updated the opportunity size to `)
                .sayAs({word: "$" + amount, interpret: "unit"})
                .say(`. `);

          query = `UPDATE ${schemaName}.Opportunity 
                  SET amount = '${amount}'`;
        } else if (closingDate) {
          debugLog(`DEBUG - closingDate update for UpdateOpportunity to ${closingDate})`);
          let formattedClosingDate = "";
          let cardText = "";
          try {
            let dateObj = new Date(closingDate);
            formattedClosingDate = getFormattedDate(dateObj);
            debugLog(`DEBUG - setting closing date to: ${formattedClosingDate} `);
          } catch (err) { throw err; }

          output.say(`I updated the closing date to`)
                .sayAs({word: formattedClosingDate, interpret: "date"})
                .say(`. `);

          query = `UPDATE ${schemaName}.Opportunity 
                  SET closedate = '${formattedClosingDate}'`;
        } else if (stage) {
          debugLog(`DEBUG - stage update for UpdateOpportunity to ${stage})`);
          output.say(`I updated the stage to ${stage}.`);

          query = `UPDATE ${schemaName}.Opportunity 
                  SET stagename = '${stage}'`;
        } else if (nextSteps) {
          debugLog(`DEBUG - next steps for UpdateOpportunity to ${nextSteps})`);
          output.say(`I updated the next steps.`);

          query = `UPDATE ${schemaName}.Opportunity 
                  SET nextstep = $$${nextSteps}$$`;
        }

        query += ` WHERE sfid = '${sessionOppId}'`;

        // Make the update query
        return sf.queryData(query).then(function(results) {
          // Refresh the opportunity data
          query = `select opp.name, opp.sfid, opp.amount, opp.closedate, opp.stagename, opp.nextstep
                  from ${schemaName}.Opportunity as opp where sfid = '${sessionOppId}'`;

          return sf.queryData(query).then(function(results) {
            output.say(` Is there anything else you'd like to update?`);
            buildOpportunityResponse(request, response, results[0], output.ssml(), "Is there anything else you'd like to update?");
          });
        });
      }
    } else {
      debugLog(`DEBUG - in UpdateOpportunity, no opportunity in session.`);
      let output = `Which opportunity do you want to update? Find one by saying: opportunity, and then providing some key words.`;
      response.say(output).reprompt(output).shouldEndSession(false);
    }
  }
);

// Standard handling for returning Opportunity details 
var buildOpportunityResponse = function(request, response, result, overrideOutput, overrideReprompt) {
  // Get a date formatted like so: ????MMDD, for easier/brief speaking of the date
  let closingDate = new Date(result.closedate);
  let formattedClosingDate = "????" + ("0" + (closingDate.getMonth()+1)).slice(-2) + ("0" + closingDate.getDate()).slice(-2);
  debugLog(`DEBUG - formatted closing date: ${formattedClosingDate}`);

  // Build the output speech
  let output = new AmazonSpeech();
  output.say(`I found an opportunity, ${result.name}, worth `)
        .sayAs({word: "$" + result.amount, interpret: "unit"})
        .say(`, in stage: ${result.stagename}, closing on `)
        .sayAs({word: formattedClosingDate, interpret: "date"})
        .say(`. `);

  let nextStep = `There are no next steps. `
  if (result.nextstep && result.nextstep != null) {
    nextStep = `The next steps are: ${result.nextstep}. `;
  } 
  output.say(nextStep);

  let reprompt = `You can make updates to your opportunity by telling me what you want to update.`;
  output.say(reprompt);

  // Build response card text
  let formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });

  let cardTitle = `Opportunity: ${result.name}`;

  let cardText = `This opportunity size is ${formatter.format(result.amount)} and is in ${result.stagename} stage.\n\n`;
  cardText += `It is set to close on ${closingDate.getMonth()+1}/${closingDate.getDate()}/${closingDate.getFullYear()}.\n\n`;
  cardText += `${nextStep}`;

  response.card(buildStandardCard(cardTitle, cardText));
  if (isRenderTemplateSupported(request)) {
    response.directive(buildBodyTemplate2Directive(cardTitle, cardText));
  }

  let finalOutput = overrideOutput || output.ssml();
  let finalReprompt = overrideReprompt || reprompt;

  response.say(finalOutput).reprompt(finalReprompt).shouldEndSession(false).send();
}

// Helper function to only log DEBUG statements if the debug flag is set to true
function debugLog(statement) {
  if (debug) {
    console.log(statement);
  }
}

// Helper function to determine if the requesting device supports Display templates. 
// If not, the skill should not send a RenderTemplate directive.
function isRenderTemplateSupported(request) {
  return request.context.System.device.supportedInterfaces.Display;;
}

// Returns a Standard card object with the given title & text
var buildStandardCard = function(title, text) {
  let card =
  {
    "type": "Standard",
    "title": title,
    "text": text,
    "image": {
      "largeImageUrl": "https://s3.amazonaws.com/alexa-salesforce-demo-skill-images/sales_image.png"
    }
  };
  return card;
}

// Echo Show - BodyTemplate 2 directive response 
var buildBodyTemplate2Directive = function(title, text) {
  let directive = 
  {
    "type": "Display.RenderTemplate",
    "template": {
      "type": "BodyTemplate2",
      "token": "opportunity",
      "backButton": "HIDDEN",
      "image": {
        "sources": [
          {
            "url": "https://s3.amazonaws.com/alexa-salesforce-demo-skill-images/sales_image.png"
          }
        ]
      },
      "title": title,
      "textContent": {
        "primaryText": {
          "text": text.replace(/\n/g,'<br/>'), //replace newlines with <br/> HTML markup for echo show templates
          "type": "RichText"
        }
      }
    }
  };
  return directive;
}

// Elicit Slot directive config for Update Opportunity intent
var buildUpdateOpportunityElicitSlotDirective = function(selectedOption) {
  let directive =
  {
    "type": "Dialog.ElicitSlot",
    "slotToElicit": selectedOption,
    "updatedIntent": {
      "name": "UpdateOpportunity",
      "confirmationStatus": "NONE",
      "slots": {
        "updateOption": {
          "name": "updateOption",
          "confirmationStatus": "NONE"
        },
        "amount": {
          "name": "amount",
          "confirmationStatus": "NONE"
        },
        "stage": {
          "name": "stage",
          "confirmationStatus": "NONE"
        },
        "closingDate": {
          "name": "closingDate",
          "confirmationStatus": "NONE"
        },
        "nextSteps": {
          "name": "nextSteps",
          "confirmationStatus": "NONE"
        }
      }
    }
  };
  return directive;
}

// Elicit Slot directive config for Get Opportunity intent
var buildGetOpportunityElicitSlotDirective = function() {
  let directive =
  {
    "type": "Dialog.ElicitSlot",
    "slotToElicit": "keywords",
    "updatedIntent": {
      "name": "GetOpportunity",
      "confirmationStatus": "NONE",
      "slots": {
        "keywords": {
          "name": "keywords",
          "confirmationStatus": "NONE"
        }
      }
    }
  };
  return directive;
}

// Obtains a slot value from entity resolution (if it matched a synonym) or just from the primary slot value
var getSlotValue = function(slot) {
  let slotValue;
  debugLog(`DEBUG - slot: ${JSON.stringify(slot)}`);
  if (slot && slot.resolutions && slot.resolutions.length > 0 && 
      slot.resolutions[0].values && slot.resolutions[0].values.length > 0) {
    // For the purpose of this skill, we'll assume that resolutions mean we have one 
    // canonical entry from one ER. It is possible, and likely, that real scnearios 
    // have multiple canonical choices, but we're being simple for a demo.
    slotValue = slot.resolutions[0].values[0].name;
    debugLog(`DEBUG - getSlotValue resolutions flow - slotValue: ${slotValue}`);

  }
  if (!slotValue && slot && slot.value) {
    // If we don't have any entity resolutions or if it didn't resolve to anything, just take the slot value (if it exists)
    slotValue = slot.value;
    debugLog(`DEBUG - getSlotValue non-resolutions flow - slotValue: ${slotValue}`);
  }
  return slotValue;
}

// Returns a date formatted like: 2018/03/08
var getFormattedDate = function(dateObj) {
  return `${dateObj.getFullYear()}-${("0" + (dateObj.getMonth()+1)).slice(-2)}-${("0" + dateObj.getDate()).slice(-2)}`;
}

/* 
 * General Intent support - start
 */

alexaApp.intent("AMAZON.HelpIntent", {
    "slots": {},
    "utterances": []
  }, function(request, response) {
    let helpOutput = "The sales assistant skill can get opportunity details, update " +
                    "an opportunity, or get your revenue report. Try asking me to find an opportunity to get started.";
    let reprompt = "What would you like to do?";
    request.getSession().clear();
    response.say(helpOutput).reprompt(reprompt).shouldEndSession(false);
  }
);

alexaApp.intent("AMAZON.StopIntent", {
    "slots": {},
    "utterances": []
  }, function(request, response) {
    let stopOutput = "OK, bye";
    response.say(stopOutput);
  }
);

alexaApp.intent("AMAZON.CancelIntent", {
    "slots": {},
    "utterances": []
  }, function(request, response) {
    let cancelOutput = "OK, bye.";
    response.say(cancelOutput);
  }
);

alexaApp.intent("AMAZON.NoIntent", {
    "slots": {},
    "utterances": []
  }, function(request, response) {
    let stopOutput = "OK, thanks for using Sales Assistant.";
    response.say(stopOutput);
  }
);

/* 
 * General Intent support - end
 */

/* 
 * General functions - start
 */

// debugging -- displays the intent being invoked
alexaApp.pre = function(request, response, type) {
  if (debug) {
    console.log(`=====================REQUEST START=====================`);
    console.log(`Intent received - ${type}`);
    console.log(JSON.stringify(request.data));
    console.log(`=====================REQUEST END  =====================`);
  }

  // Pre-populate the user's Salesforce userId so we can refer to it elsewhere
  let session = request.getSession();
  if (!session.get("userId")) {
    let accessToken = request.getSession().details.user.accessToken;
    return sf.getIdentity(accessToken).then(function(userId) {
      session.set("userId", userId);
    }).catch(function(err) {
      console.log(`ERROR - ${err}`);
      let output = `You need to link a Salesforce account before you can use this skill.
                    I've sent a card to your Alexa app to help.`;
      response.linkAccount().say(output).send();
    });
  }
};

// the last thing executed for every request. turn any exception inta a respose
alexaApp.post = function(request, response, type, exception) {

  if (debug) {
    console.log(`=====================RESPONSE START=====================`);
    console.log(JSON.stringify(response));
    console.log(`=====================RESPONSE END  =====================`);
  }

  if (exception) {
    // always turn an exception into a successful response
    return response.clear().say(`Drat! An error occured: ${exception}`).send();
  }
};

alexaApp.error = function(exception, request, response) {
  console.log(`ERROR - ${exception}`);
  response.say(`Sorry, something unexpected happened. Please try Sales Assistant later.`);
};

app.get('/', function (req, res) {
  res.render('index');
})

app.listen(PORT);

/* 
 * General functions - end
 */
