![Wishlist - JH](https://i.ibb.co/C0wjg17/Screenshot-2024-04-08-at-06-04-59.png "Wishlist - JH")

# Wishlist - JH

Wishlist is a feature that allows marketplace users to have their own list for their favorite items.

## Table of Contents
- [Demo](#demo)
- [Installation](#installation)
- [Usage](#usage)
	- [Client](#usage-client) 
	- [Server](#usage-server)
- [How to](#how-to)
 	- [Client](#how-to-client) 
	- [Server](#how-to-server)
- [Known issues](#known-issues)
- [Contributing | Bug report](#contributing-bug-report)
- [License](#license)
- [Todos](#todos)
- [Changelog](#changelog)

## <a name="demo"></a>Demo 💥
- [Sharetribe Horizon Vite Template](https://stdemo.jhorizon.io)

## <a name="installation"></a> Installation
### 1. PREREQUISITES
- Install and setup [sharetribe-horizon-scripts](https://github.com/journeyhorizon/sharetribe-horizon-scripts) following the [README.md](https://github.com/journeyhorizon/sharetribe-horizon-scripts/blob/main/README.md)

### 2. INSTALL THE EXTENSIONS
- Fresh repository without any existing configuration
```bash
sharetribe-horizon-scripts extensions setup
`? Use automatic name generation based on remote name?` no
`? Enter remote client url (press Enter and leave empty to skip):` git@github.com:journeyhorizon/sharetribe-horizon-extensions-wishlist-client.git
`? Enter remote server url (press Enter and leave empty to skip):` 
git@github.com:journeyhorizon/sharetribe-horizon-extensions-wishlist-server.git
`? Enter extension name` wishlist
```

- Existing configuration
```bash
sharetribe-horizon-scripts extensions add
`? Use automatic name generation based on remote name?` no
`? Enter remote client url (press Enter and leave empty to skip):` git@github.com:journeyhorizon/sharetribe-horizon-extensions-wishlist-client.git
`? Enter remote server url (press Enter and leave empty to skip):` 
git@github.com:journeyhorizon/sharetribe-horizon-extensions-wishlist-server.git
`? Enter extension name` wishlist
```

### 3. INSTALL CODE TOUR
- Install `Code Tour` - VS Code extension
- Open `wishlist.tour` file and follow through steps

## <a name="usage"></a> Usage
### <a name="usage-client"></a>Client
#### Pages
- [WishlistPage.jsx](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/containers/WishlistPage/WishlistPage.jsx)

![Wishlist - JH](https://sharetribe.imgix.net/65953e72-a81c-41f3-90a5-19b9644fc048/66132750-c24b-4c34-a521-e4fc1d4b3309?auto=format&fit=clip&h=2400&w=2400&s=6aac780d0ee8819adfc7cdddfc20c685 "Wishlist - JH")

#### Components
- [WishlistListingCard.jsx](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/components/WishlistListingCard/WishlistListingCard.jsx) - Replicate of `/ManageListingsPage/ManageListingCard/ManageListingCard.js`
- [Overlay.jsx](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/components/WishlistListingCard/Overlay.jsx) - Replicate of `/ManageListingsPage/ManageListingCard/Overlay.js`
- [MenuIcon.jsx](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/components/WishlistListingCard/MenuIcon.jsx) - Replicate of `/ManageListingsPage/ManageListingCard/MenuIcon.js`
- [BookmarkButton.jsx](#component-details-bookmark-button-jsx)
- [IconHeart.jsx](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/components/BookmarkButton/IconHeart.jsx)

#### Ducks
- [wishlist.duck.js](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/wishlist.duck.js)
- [WishlistPage.duck.js](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/containers/WishlistPage/WishlistPage.duck.js)



#### <a name="component-details"></a> Component Details
<details>
  <summary><strong>BookmarkButton.jsx</strong></summary><a name="component-details-bookmark-button-jsx"></a>

 ###### BookmarkButton(props) ⇒ <code>JSX.Element</code>
A button for toggling the bookmark status of the listing.

**Returns**: <code>JSX.Element</code> - The rendered button component.
**Props**:

| Param | Type | Description | Required? | Default value |
| --- | --- | --- | --- | --- |
| rootClassName | <code>string</code> | The root class name of the component (will override the default one) | false | null |
| className | <code>string</code> | The subclass name of css (will be combined with the default one) | false | null |
| listingId | <code>UUID</code> &#124; <code>string</code> | The listing id | true | null |
| listingAuthor | <code>User</code> | The listing author | true | null |
| isVisible | <code>bool</code> | This component should be visible or not | false | true |
| showTitle | <code>bool</code> | This component should show title or not | false | false |
| iconPosition | <code>left</code> &#124; <code>right</code>| The position of the icon | false | <code>left</code> |

**Example**
```js
// Render a button with heart icon
<BookmarkButton listingId={listingId} listingAuthor={listingAuthor} />
```
</details>

---
### <a name="usage-server"></a>Server
Wishlist feature supports:
- REST API
- GraphQL (*Coming soon*)

#### ENDPOINTS:
-----
 `PUT` <code>/api/wishlist</code> : Add a listing to wishlist
- **Body request**: 
	- <code>listingId</code>: Listing ID
- **Middlewares**: [authenticatedUser.js](https://github.com/journeyhorizon/sharetribe-horizon-extensions-common-server/blob/main/middlewares/authenticatedUser.js) - Check the `currentUser` entity to ensure the current user is authorized to add a new listing to own wishlist
- **Modules**: 
	- [Sharetribe Extended Data](https://www.sharetribe.com/docs/references/extended-data/): [/mod/wishlist/sharetribeExtendedData/add.js](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-server/blob/main/mod/wishlist/sharetribeExtendedData/add.js)
- **Sample response**:
	- `status`: 200
	- `data`: 
	```js
    {
    	data: {
        	listing,
          user
        }
    }
  ```

`DELETE` <code>/api/wishlist/{listingId}</code> : Remove a listing from wishlist
- **Params**
	- <code>listingId</code>: Listing ID
- **Middlewares**: [authenticatedUser.js](https://github.com/journeyhorizon/sharetribe-horizon-extensions-common-server/blob/main/middlewares/authenticatedUser.js) - Check the `currentUser` entity to ensure the current user is authorized to remove a listing from own wishlist
- **Modules**:
	- [Sharetribe Extended Data](https://www.sharetribe.com/docs/references/extended-data/): [/mod/wishlist/sharetribeExtendedData/remove.js](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-server/blob/main/mod/wishlist/sharetribeExtendedData/remove.js)
- **Sample response**:
	- `status`: 200
	- `data`: 
	```js
    {
    	data: {
      		message: 'The listing has been removed successfully!',
    	}
    }
  ```

#### SOLUTIONS
---
Wishlist feature is implemented with 2 solutions:
- [Sharetribe Extended Data](https://www.sharetribe.com/docs/references/extended-data/)
- [Journey Horizon Database]()

<details>
<a name="solution-sharetribe-extended-data"></a>
  <summary><strong>SHARETRIBE EXTENDED DATA (LOW-COST)</strong></summary>

 ###### PROS:
- Supported by Sharetribe SDK
- Shallow, short learning curve

###### CONS:
- [Limited 50kb by Sharetribe](https://www.sharetribe.com/docs/references/extended-data/)

> For all types of extended data across all resources, the total size of an extended data object as JSON string must not exceed 50KB.
</details>


<details>
  <summary><strong>JOURNEY HORIZON DATABASE</strong></summary>

 *COMING SOON*
</details>


## <a name="how-to"></a> How to
### <a name="how-to-client"></a>Client
<details>
	<a name="how-to-route-configuration"></a>
	<summary><strong>ROUTE CONFIGURATION</strong></summary>
  
  - Go to [/extensions/wishlist/route.js](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/routes.js) and change `path` and `name` to desired ones. This route will be automatically loaded to the global routes.
  ```js
  {
    path: '/wishlist',
    name: 'WishlistPage',
    auth: true,
    authPage: 'LoginPage',
    component: WishlistPage,
    loadData: WishlistPageLoader,
  }
  ```
</details>
<details>
  <summary><strong>NAVBAR LINK CONFIGURATION - NO CODE</strong></summary>
  <ol>
  <li>Navigate to <code>Sharetribe Console</code> > <code>Build</code> > <code>Topbar</code> > <code>Custom links</code></li>
  <li>Click <code>+ Add a new link</code></li>
  <li>Set <code>Link Type</code> to <code>Internal Link</code></li>
  <li>Change <code>Internal link text</code> to the desired display text</li>
  <li>Change <code>Internal link address</code> to the <code>path</code> which has been set in <a href=#how-to-route-configuration>ROUTE CONFIGURATION</a> section, i.e. <code>/wishlist</code></li>
  <li>Select either of <code>Show link in top bar</code> and <code>Show link in a dropdown menu</code> for <code>Link placement</code>, depends on the requirement</li></ol>
  
 **Example**:
  [![https://i.ibb.co/ts23VbG/Screenshot-2024-04-08-at-18-44-24.png](https://i.ibb.co/ts23VbG/Screenshot-2024-04-08-at-18-44-24.png)](https://i.ibb.co/ts23VbG/Screenshot-2024-04-08-at-18-44-24.png)
  
  - **Pros**:
  	- Fast, no code required
  	- Easy for customer to customize the link for their own purpose
  -	**Cons**:
  	- Cannot display icon instead of text 
  	- Can't put the link to profile menu but create another link menu

</details>
<details>
  <summary><strong>NAVBAR LINK CONFIGURATION - WITH CODE</strong></summary>
  
  - **Option 1 - User profile menu:**
  	- **Navbar.js**
  	```JSX 
    const tabs = [
      ...,
      {
        text: <FormattedMessage id="UserNav.myWishlistLink" />,
        selected: currentPage === 'WishlistPage',
        linkProps: {
          name: 'WishlistPage',
        },
      },
    ]
    ```
	- **TopbarMobileMenu.js**
	```JSX 
    	<div className={css.accountLinksWrapper}>
          ...
          <NamedLink
            className={classNames(css.navigationLink, currentPageClass('WishlistPage'))}
            name="WishlistPage"
          >
            <FormattedMessage id="TopbarMobileMenu.myWishlistLink" />
          </NamedLink>
        </div>
    ```
    - **TopbarDesktop.js**
    ```JSX
       <MenuContent className={css.profileMenuContent}>
          ...
          <MenuItem key="WishlistPage">
            <NamedLink
              className={classNames(css.menuLink, currentPageClass('WishlistPage'))}
              name="WishlistPage"
            >
              <span className={css.menuItemBorder} />
              <FormattedMessage id="TopbarDesktop.myWishlistLink" />
            </NamedLink>
          </MenuItem>
          ...
        </MenuContent>
    ```
    
  - **Option 2 - Nav item:**
  	```jsx
    const WishlistLink = () => {
      return (
        <NamedLink className={css.topbarLink} name="WishlistPage">
          <span className={css.topbarLinkLabel}>
            <FormattedMessage id="TopbarDesktop.myWishlistLink" />
          </span>
        </NamedLink>
      );
	};
    
    const TopbarDesktop = (props) => {
      ...
      const wishlistLinkMaybe = authenticatedOnClientSide ? <WishlistLink /> : null;
      ...
      return (
        ...
        {wishlistLinkMaybe}
        {inboxLinkMaybe}
        {profileMenuMaybe}
        ...
      )
    }
    ```
    
 - **Pros**:
  	- Can use icon or whatever to display as nav item
  	- Easy for developers to customize and adjust the position of nav item
  -	**Cons**:
  	- Difficult for users to customize by their owns
</details>
<details>
  <summary><strong>ENABLE USERS TO BOOKMARK OWN LISTINGS</strong></summary>
  `.env` file:
  
   ```bash
   # Use for both client & server
   VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING=true
   ```
    
</details>
<details>
  <summary><strong>BOOKMARK BUTTON</strong></summary>
  
  Basic: 
  ```JSX
  <BookmarkButton listingId={listingId} listingAuthor={listingAuthor} />
  ```
  
  Override styles
  ```JSX
  <BookmarkButton listingId={listingId} listingAuthor={listingAuthor} rootClassName={...}/>
  ```
  
  Add more styles
  ```JSX
  <BookmarkButton listingId={listingId} listingAuthor={listingAuthor} className={...}/>
  ```
  
  Hide the button
  ```JSX
  <BookmarkButton listingId={listingId} listingAuthor={listingAuthor} isVisible={false}/>
  ```
    
</details>

### <a name="how-to-server"></a>Server

<details>
  <summary><strong>ENABLE USERS TO BOOKMARK OWN LISTINGS</strong></summary>
  `.env` file:
  
   ```bash
   # Use for both client & server
   VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING=true
   ```
    
</details>

## <a name="known-issues"></a> Known issues
- Currently using [SHARETRIBE EXTENDED DATA solution](#solution-sharetribe-extended-data) only, the data might exceed limit of 50kb but no any fixed limit to prevent that
- No rate limit for REST API endpoint
- No UI for showing errors if the bookmark events failed
- (To be continued...)

## <a name="contributing-bug-report"></a>Contributing | Bug report

Pull requests or issues are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to pull the newest updates as appropriate.

## <a name="todos"></a>Todos

- [ ] Implement GraphQL API query
- [ ] Use JH Database solution for unlimited data
- [ ] Update `How-to` section
- [ ] Show errors if the bookmark events are failed


## <a name="changelog"></a>Changelog

See [CHANGELOG](https://github.com/journeyhorizon/sharetribe-horizon-extensions-wishlist-client/blob/main/CHANGELOG.md)

## <a name="license"></a>License

[Commercial]()
