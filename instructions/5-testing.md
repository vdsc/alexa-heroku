# Alexa Skill Sample - Sales Assistant

[![Salesforce Setup](https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/tutorial-page-marker-1-done._TTH_.png)](./1-salesforce-setup.md)[![Deploy](https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/tutorial-page-marker-2-done._TTH_.png)](./2-heroku.md)[![Account Linking](https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/tutorial-page-marker-3-done._TTH_.png)](./3-deploy.md)[![Testing](https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/tutorial-page-marker-4-done._TTH_.png)](./4-account-linking.md)[![Distribute Private Skills](https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/tutorial-page-marker-5-on._TTH_.png)](./5-testing.md)[![Distribute Private Skills](https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/tutorial-page-marker-6-off._TTH_.png)](./6-distribute-private-skills.md)

## Part 5: Testing

Now that you completed most of the setup, let's make sure everything is working. You start by validating the account linking flow, then interact with the skill to create a voice code and access Salesforce data.

### Test the Linking Flow

1. Go to your Alexa app on your device (or go to https://alexa.amazon.com).
2. Click **Skills**. 
3. Click **Your Skills**.
4. Find the **Sales Assistant** skill and click it.
5. Click **Settings**.
6. Click **Link Account**.

Your browser or device will then open a window to the Salesforce login screen. 
Enter your Salesforce user credentials, and you should see a page letting you know your skill was successfully linked.

### Use the Skill

1. Try out the following request: “Alexa, open Sales Assistant.”
2. Alexa will welcome you and prompt you with some functions you can use.
3. Try "Tell me my revenue report".
4. Alexa will tell you any opportunities that are closing or closed in this current fiscal quarter.
5. Try "Get my United Oil opportunity".
6. Alexa will ask you to help provide some terms to limit the results. Try saying "Installations".
7. Alexa will now read you specific opportunity details. You can then change the opportunity size, stage, amount, or next steps. Try changing each one of these options.
8. Check in your Alexa application or Echo Show and you should receive a card that shows the updated opportunity details.

[![Next](https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/button-next._TTH_.png)](./6-distribute-private-skills.md)
