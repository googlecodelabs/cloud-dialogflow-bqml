/**
* Copyright 2017 Google Inc. All Rights Reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*    http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

"use strict";

const functions = require("firebase-functions");
const { WebhookClient } = require("dialogflow-fulfillment");
const { Card } = require("dialogflow-fulfillment");
const BIGQUERY = require("@google-cloud/bigquery");

const BIGQUERY_CLIENT = new BIGQUERY({
projectId: "your-project-id" // ** CHANGE THIS **
});

process.env.DEBUG = "dialogflow:debug";

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(
(request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log(
    "Dialogflow Request headers: " + JSON.stringify(request.headers)
  );
  console.log("Dialogflow Request body: " + JSON.stringify(request.body));

  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }

  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }

  function ticketCollection(agent) {
    // Capture Parameters from the Current Dialogflow Context
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
    const OUTPUT_CONTEXTS = request.body.queryResult.outputContexts;
    const EMAIL = OUTPUT_CONTEXTS[OUTPUT_CONTEXTS.length - 1].parameters["email.original"];
    const ISSUE_CATEGORY = OUTPUT_CONTEXTS[OUTPUT_CONTEXTS.length - 1].parameters.category;
    const ISSUE_TEXT = request.body.queryResult.queryText;
 

    // The SQL Query to Run
    const SQLQUERY = `WITH pred_table AS (SELECT 5 as seniority, "3-Advanced" as experience,
          @category as category, "Request" as type)
          SELECT cast(predicted_label as INT64) as predicted_label
          FROM ML.PREDICT(MODEL helpdesk.predict_eta,  TABLE pred_table)`;

    const OPTIONS = {
      query: SQLQUERY,
      // Location must match that of the dataset(s) referenced in the query.
      location: "US",
      params: {
        category: ISSUE_CATEGORY
      }
    };
    return BIGQUERY_CLIENT.query(OPTIONS)
      .then(results => {
        //Capture results from the Query
        console.log(JSON.stringify(results[0]));
        const QUERY_RESULT = results[0];
        const ETA_PREDICTION = QUERY_RESULT[0].predicted_label;
    
        //Format the Output Message
        agent.add( EMAIL + ", your ticket has been created. Someone will you contact shortly. " +
            " The estimated response time is " + ETA_PREDICTION  + " days."
        );
        agent.add(
          new Card({
            title:
              "New " + ISSUE_CATEGORY +
              " Request for " + EMAIL +
              " (Estimated Response Time: " + ETA_PREDICTION  +
              " days)",
            imageUrl:
              "https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png",
            text: "Issue description: " + ISSUE_TEXT,
            buttonText: "Go to Ticket Record",
            buttonUrl: "https://assistant.google.com/"
          })
        );
        agent.setContext({
          name: "submitticket-collectname-followup",
          lifespan: 2
        });
      })
      .catch(err => {
        console.error("ERROR:", err);
      });
  }

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set("Default Welcome Intent", welcome);
  intentMap.set("Default Fallback Intent", fallback);
  intentMap.set("Submit Ticket - Issue Category", ticketCollection);
  agent.handleRequest(intentMap);
}
);
