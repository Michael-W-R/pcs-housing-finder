# Enabling rush-hour commute times (TomTom key)

The commute check normally shows drive times on open roads. With a free TomTom
API key configured, every commute check also shows **rush-hour estimates** —
what the same drive looks like departing at 7:30 AM and 5:15 PM on a weekday,
based on TomTom's historical + live traffic data.

## Why a key is needed

Traffic data isn't available from any keyless public service. TomTom's free
tier covers **2,500 routing requests per day with no credit card** — each map
tap uses 2 requests (AM + PM), and repeat taps on the same spot are cached, so
that's roughly 1,000+ commute checks per day before the feature would pause
until midnight. Plenty for now.

## Setup (~5 minutes, one time)

1. Create a free account at **https://developer.tomtom.com/** (email +
   password; no payment info).
2. In the dashboard, open **API & SDK Keys**. A first key is usually created
   for you — otherwise create one. Copy it.
3. Open `web/js/config.js` and paste the key between the quotes:
   ```js
   export const TOMTOM_KEY = "your-key-here";
   ```
4. Commit and push (or tell Claude to). The next deploy turns the feature on —
   an orange "Rush hour: ~38 min at 7:30 AM · ~35 min at 5:15 PM" line appears
   under each commute result.

## Notes

- **The key will be publicly visible** in the repo and site source. That's
  normal for map-service keys on static sites, and the only risk is someone
  else burning your free quota. If that happens, regenerate the key in the
  TomTom dashboard (and consider their key-restriction options). A proxy that
  hides the key server-side is a possible later upgrade.
- If the key is missing, invalid, or over quota, the app silently shows the
  normal no-traffic times — nothing breaks.
- Rush-hour times are always computed for the **next weekday**, so results are
  consistent even on weekends.
