# Site analytics consent

Google Analytics and the SuperDoc referral click event run only after a visitor accepts analytics on this origin. A choice made on another domain does not count. The saved choice is versioned and expires after 180 days; malformed, future and expired records fail closed. Do Not Track, Global Privacy Control and the explicit opt-out override a saved grant.

Before consent the page loads no Google script and sets no Google cookies. After consent the tag loads once, with advertising storage, Google signals and ad personalization off, and the initial page location sent as origin plus path. Known ecosystem campaign tags and public referring origins are kept; other query values, referring paths and fragments are not.

Cookie settings are available on every page. Withdrawing consent disables measurement, clears this site's GA cookies and reloads the page so the loaded SDK stops. Other tabs pick up the change through the storage event, and pages restored from the back-forward cache recheck the saved choice. Sign-in and sign-up pages, local development and preview hosts never load the tag.

Run `bun run test:growth` for the consent and referral-event tests. The tests use synthetic inputs and never send events to the production property.
