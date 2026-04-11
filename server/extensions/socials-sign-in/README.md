# Socials Sign In - JH

This extension allows users to sign in using their social media accounts.

Supported social media accounts:

- [X] Google
- [X] Facebook
- [X] X/Twitter
- [X] LinkedIn
- [X] Apple

## Table of Contents
- [Socials Sign In - JH](#socials-sign-in---jh)
  - [Table of Contents](#table-of-contents)
  - [Demo](#demo)
  - [Installation](#installation)
    - [1. PREREQUISITES](#1-prerequisites)
    - [2. INSTALL THE EXTENSIONS](#2-install-the-extensions)
    - [3. CONFIGURATION](#3-configuration)
      - [3.1 Apple](#31-apple)
      - [3.2 Google](#32-google)
      - [3.3 X/Twitter](#33-xtwitter)
      - [3.4 Facebook](#34-facebook)
      - [3.5 LinkedIn](#35-linkedin)
  - [Contributing | Bug report](#contributing--bug-report)
  - [License](#license)

## Demo
- [Sharetribe Horizon Vite Template](https://stdemo.jhorizon.io)

## Installation
### 1. PREREQUISITES
- Install and setup [sharetribe-horizon-scripts](https://github.com/journeyhorizon/sharetribe-horizon-scripts) following the [README.md](https://github.com/journeyhorizon/sharetribe-horizon-scripts/blob/main/README.md)

### 2. INSTALL THE EXTENSIONS
- Fresh repository without any existing configuration
```bash
sharetribe-horizon-scripts extensions setup

Use automatic name generation based on remote name?: no

Enter remote client url (press Enter and leave empty to skip): git@github.com:journeyhorizon/sharetribe-horizon-extensions-socials-sign-in-client.git

Enter remote server url (press Enter and leave empty to skip): git@github.com:journeyhorizon/sharetribe-horizon-extensions-socials-sign-in-server.git

Enter extension name: socials-sign-in


Enter remote client url (press Enter and leave empty to skip): git@github.com:journeyhorizon/sharetribe-horizon-extensions-common-client.git

Enter remote server url (press Enter and leave empty to skip): git@github.com:journeyhorizon/sharetribe-horizon-extensions-common-server.git

Enter extension name: common
```

- Existing configuration
```bash
sharetribe-horizon-scripts extensions add

Use automatic name generation based on remote name?: no

Enter remote client url (press Enter and leave empty to skip): git@github.com:journeyhorizon/sharetribe-horizon-extensions-socials-sign-in-client.git

Enter remote server url (press Enter and leave empty to skip): git@github.com:journeyhorizon/sharetribe-horizon-extensions-socials-sign-in-server.git

Enter extension name: socials-sign-in


Enter remote client url (press Enter and leave empty to skip): git@github.com:journeyhorizon/sharetribe-horizon-extensions-common-client.git

Enter remote server url (press Enter and leave empty to skip): git@github.com:journeyhorizon/sharetribe-horizon-extensions-common-server.git

Enter extension name: common
```

### 3. CONFIGURATION
#### 3.1 Apple
- Apple Developer Configuration
  - Create a new App ID
    ![image](https://user-images.githubusercontent.com/5569219/59017558-6d643600-8861-11e9-927b-a4952b56f34e.png)
  You need to create this even if you don't have an iOS or a Mac app
    ![image](https://user-images.githubusercontent.com/5569219/59460984-f967f600-8e3d-11e9-926e-ef39aa1f8e48.png)
  Scroll down to "Capabilities", and find "Sign in with Apple" and check it.
    ![image](https://user-images.githubusercontent.com/5569219/59017720-dea3e900-8861-11e9-898e-f486c093edd8.png)
  Click continue and then register.
  - Create a services ID
    ![image](https://user-images.githubusercontent.com/5569219/59017808-16ab2c00-8862-11e9-8beb-4da7bb509b0c.png)

    Fill out the details here, and click configure on "Sign in with Apple".
    ![image](https://user-images.githubusercontent.com/5569219/59017915-5540e680-8862-11e9-8fd0-e26c425348db.png)

    Add your domain that you'll use in the "Domains" section and the redirect url that you want to allow
    ![image](https://user-images.githubusercontent.com/5569219/59018072-a7820780-8862-11e9-9e79-a8c7bb71ca45.png)

    Click Continue and Register.

    Now, you need to verify this domain and in order to do that, click on the Service ID that you just created, again, and click configure on "Sign in with Apple". When you do that, you should be able to see that there is a download and a verify button.

    ![image](https://user-images.githubusercontent.com/5569219/59018636-f54b3f80-8863-11e9-919e-be685f171f95.png)

  - Create a new Key
    Go to the "Keys" section in your Developer account and create one like this:

    ![image](https://user-images.githubusercontent.com/5569219/59018970-be295e00-8864-11e9-9129-3619ea3a5af3.png)

    Click on configure on the `Sign in with Apple` option and make sure it is assigned to the correct `App ID`. Click continue and register. Now, click on Download and *`MAKE SURE YOU KEEP THE FILE SAFE AND SECURE! YOU CANNOT RE-DOWNLOAD IT ONCE YOU HAVE ALREADY DOWNLOADED IT`*

- Add the key to the server environment variables
  - `VITE_APPLE_CLIENT_ID`: is actually called the `Service ID` that you will create in the 'Identifiers' section
  ![image](https://user-images.githubusercontent.com/5569219/59019687-24fb4700-8866-11e9-8302-291a0d63006b.png)
  - `APPLE_TEAM_ID`: is your `Team ID` that you can find in the [`Membership` section](https://developer.apple.com/account#MembershipDetailsCard)
  - `APPLE_KEY_ID`: is the `Key ID` that you will find in the `Keys` section
  ![image](https://user-images.githubusercontent.com/5569219/59019916-87544780-8866-11e9-94d8-f454741dcbc6.png)
  - `APPLE_PRIVATE_KEY_BASE64`: is the `private key` that you downloaded and converted to base64
  - `APPLE_IPD_ID`: is the `App ID` that you set in the Sharetribe Console

- Register an Identity provider client in Sharetribe Console
  - Go to the [Social logins & SSO](https://console.sharetribe.com/o/YOUR_ORG/m/YOUR_ENV/advanced/social-logins-and-sso)
  - Click on `+ Add a new client...`
  - Fill in the `Add a new client` form:
    - Client Name: your client name
    - Identity Provider: Select `+ Add a new identity provider`
    - Identity provider name: Apple
    - Identity provider URL: `https://appleid.apple.com`
    - Client ID: Created services ID in the Apple Developer portal
    - Trusted client IDs: Add your app client ID
    - Click Add client

#### 3.2 Google
- Create a new project in the Google Cloud Console
- Create a new OAuth 2.0 client ID
- Set the redirect URL in the `OAuth 2.0 client ID` section
- Add the client ID to the client environment variables
```bash
VITE_GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```
- Register an Google provider in Sharetribe Console
  - Go to the [Social logins & SSO](https://console.sharetribe.com/o/YOUR_ORG/m/YOUR_ENV/advanced/social-logins-and-sso)
  - Click on `+ Add a new client...`
  - Fill in the `Add a new client` form:
    - Client Name: your client name
    - Identity Provider: Select `Google`
    - Client ID: Created OAuth 2.0 client ID in the Google Developer Console
    - Client secret: Created OAuth 2.0 client secret in the Google Developer Console
    - Trusted client IDs: Add your app client ID
    - Click Add client

#### 3.3 X/Twitter
- Create a new project in the [Twitter Developer portal](https://developer.x.com/en/portal/dashboard)
- Create a new API key
- Add redirect URL in the `User authentication settings` section
- Add the API key to the server environment variables
  - `TWITTER_CONSUMER_KEY`: is the `API key` that you will find in the `Keys and tokens` section
  - `TWITTER_CONSUMER_SECRET`: is the `API secret key` that you will find in the `Keys and tokens` section

  `NOTE:` *`The consumer keys CAN NOT reveal after you copy them. Make sure you copy them to a safe place`*.
  - `VITE_TWITTER_CLIENT_ID`: is the `Client ID` that you will find in the `OAuth 2.0 Client Id and Client Secret`
  - `VITE_TWITTER_IDP_ID`: is the `IDP ID` that you set in the Sharetribe Console

- Register an Twitter provider in Sharetribe Console
  - Go to the [Social logins & SSO](https://console.sharetribe.com/o/YOUR_ORG/m/YOUR_ENV/advanced/social-logins-and-sso)
  - Click on `+ Add a new client...`
  - Fill in the `Add a new client` form:
    - Client Name: your client name
    - Identity Provider: Select `+ Add a new identity provider`
    - Identity provider name: Twitter
    - Identity provider URL: `https://URL_SERVER_URL/api/socials-sign-in`
    - Client ID: Created client ID in the Twitter Developer portal
    - Click Add client

#### 3.4 Facebook
- Create a new project in the Facebook Developer
- Create a new app
- Add redirect url on the Facebook Developer
- Add the app ID and app secret to the server environment variables
```bash
VITE_FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
```

- Register an Facebook provider in Sharetribe Console
  - Go to the [Social logins & SSO](https://console.sharetribe.com/o/YOUR_ORG/m/YOUR_ENV/advanced/social-logins-and-sso)
  - Click on `+ Add a new client...`
  - Fill in the `Add a new client` form:
    - Client Name: your client name
    - Identity Provider: Select `Facebook`
    - Client ID: Created app ID in the Facebook Developer portal
    - Client secret: Created app secret in the Facebook Developer portal
    - Click Add client

#### 3.5 LinkedIn
- Create a new project in the LinkedIn Developer dashboard
- Create a new app
- Add redirect url in the `Auth` section
- Add the client ID and client secret to the server environment variables
```bash
VITE_LINKED_IN_CLIENT_ID=your_client_id
LINKED_IN_CLIENT_SECRET=your_client_secret
LINKED_IN_IDP_ID=your_idp_id
```

- `VITE_LINKED_IN_CLIENT_ID`: is the `Client ID` that you will find in the `Auth` section
- `LINKED_IN_CLIENT_SECRET`: is the `Client secret` that you will find in the `Auth` section
- `LINKED_IN_IDP_ID`: is the `IDP ID` that you set in the Sharetribe Console

- Register an Apple provider in Sharetribe Console
  - Go to the [Social logins & SSO](https://console.sharetribe.com/o/YOUR_ORG/m/YOUR_ENV/advanced/social-logins-and-sso)
  - Click on `+ Add a new client...`
  - Fill in the `Add a new client` form:
    - Client Name: your client name
    - Identity Provider: Select `+ Add a new identity provider`
    - Identity provider name: LinkedIn
    - Identity provider URL: `https://www.linkedin.com/oauth`
    - Client ID: Created client ID in the LinkedIn Developer portal
    - Click Add client

## <a name="contributing-bug-report"></a>Contributing | Bug report

Pull requests or issues are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to pull the newest updates as appropriate.

## <a name="license"></a>License

[Commercial]()